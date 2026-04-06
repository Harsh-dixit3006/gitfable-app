package service

import (
	"context"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nishantg96/gitfable/internal/database"
)

// Browse — choose is free, XP only on merge.
var BrowseMergeXPByRarity = map[string]int{
	"common": 25, "rare": 50, "epic": 100,
}

// Draw (3x) — random card draw with rarity surprise.
var DrawMergeXPByRarity = map[string]int{
	"common": 75, "rare": 150, "epic": 300, "legendary": 500,
}

// MergeResult contains the outcome of a completed merge.
type MergeResult struct {
	Draw      database.Draw
	XPAwarded int
	NewBadges []string
}

// MergeParams contains everything needed to complete a merge.
type MergeParams struct {
	DrawID         int64
	UserID         int64
	IssueID        int64
	Source         string // "draw" or "choose"
	MergeCommitSHA string
	RewardSource   string // "manual_verify" or "webhook"
}

// CompleteMerge performs the full transactional merge: update draw status,
// award rarity-based XP, increment contributions, update streak, check
// badges, and create an activity record. This is the single source of truth
// for merge logic, used by both manual verify and webhook handlers.
func CompleteMerge(ctx context.Context, pool *pgxpool.Pool, queries *database.Queries, params MergeParams) (*MergeResult, error) {
	// Look up issue for rarity and activity record.
	issue, err := queries.GetIssueByID(ctx, params.IssueID)
	if err != nil {
		return nil, fmt.Errorf("get issue: %w", err)
	}

	// Compute merge XP based on issue rarity and draw source.
	mergeXPMap := DrawMergeXPByRarity
	if params.Source == "choose" {
		mergeXPMap = BrowseMergeXPByRarity
	}
	mergeXP := mergeXPMap[issue.Rarity]
	if mergeXP == 0 {
		mergeXP = mergeXPMap["common"]
	}

	// Begin transaction.
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	qtx := queries.WithTx(tx)

	// Merge the draw (status guard: only merges if still pr_submitted).
	mergedDraw, err := qtx.MergeDraw(ctx, database.MergeDrawParams{
		ID:             params.DrawID,
		MergeCommitSha: pgtype.Text{String: params.MergeCommitSHA, Valid: params.MergeCommitSHA != ""},
		XpAwarded:      int32(mergeXP),
		RewardSource:   pgtype.Text{String: params.RewardSource, Valid: true},
	})
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, ErrAlreadyMerged
		}
		return nil, fmt.Errorf("merge draw: %w", err)
	}

	// Award XP.
	txXP := NewXPService(qtx)
	if _, _, err = txXP.AwardXP(ctx, params.UserID, mergeXP); err != nil {
		return nil, fmt.Errorf("award xp: %w", err)
	}

	// Increment contributions.
	if err = qtx.IncrementContributions(ctx, params.UserID); err != nil {
		return nil, fmt.Errorf("increment contributions: %w", err)
	}

	// Update streak.
	txStreaks := NewStreakService(qtx)
	if err = txStreaks.UpdateStreak(ctx, params.UserID); err != nil {
		return nil, fmt.Errorf("update streak: %w", err)
	}

	// Get updated user for badge checks.
	updatedUser, err := qtx.GetUserByID(ctx, params.UserID)
	if err != nil {
		return nil, fmt.Errorf("get updated user: %w", err)
	}

	// Check badges.
	txBadges := NewBadgeService(qtx)
	newBadges, err := txBadges.CheckBadges(ctx, params.UserID, BadgeUser{
		LongestStreak: updatedUser.LongestStreak,
	})
	if err != nil {
		// Non-fatal: continue with the merge.
		newBadges = []string{}
	}

	// Create activity.
	_, err = qtx.CreateActivity(ctx, database.CreateActivityParams{
		UserID:    params.UserID,
		DrawID:    pgtype.Int8{Int64: params.DrawID, Valid: true},
		Action:    database.ActivityActionMerged,
		RepoOwner: pgtype.Text{String: issue.RepoOwner, Valid: true},
		RepoName:  pgtype.Text{String: issue.RepoName, Valid: true},
		Title:     pgtype.Text{String: issue.Title, Valid: true},
	})
	if err != nil {
		return nil, fmt.Errorf("create activity: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	return &MergeResult{
		Draw:      mergedDraw,
		XPAwarded: mergeXP,
		NewBadges: newBadges,
	}, nil
}

// ErrAlreadyMerged is returned when a draw has already been merged.
var ErrAlreadyMerged = fmt.Errorf("draw already merged or status changed")
