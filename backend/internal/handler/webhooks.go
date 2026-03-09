package handler

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/service"
)

const webhookMergeXP = 100

type WebhookHandler struct {
	pool          *pgxpool.Pool
	queries       *database.Queries
	webhookSecret string
	xp            *service.XPService
	badges        *service.BadgeService
	streaks       *service.StreakService
}

func NewWebhookHandler(
	pool *pgxpool.Pool,
	queries *database.Queries,
	webhookSecret string,
	xp *service.XPService,
	badges *service.BadgeService,
	streaks *service.StreakService,
) *WebhookHandler {
	return &WebhookHandler{
		pool:          pool,
		queries:       queries,
		webhookSecret: webhookSecret,
		xp:            xp,
		badges:        badges,
		streaks:       streaks,
	}
}

func (h *WebhookHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/github", h.GitHub)
	return r
}

// GitHub handles POST /github — GitHub webhook endpoint for PR merge events.
func (h *WebhookHandler) GitHub(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// 1. Read raw body for signature verification.
	body, err := io.ReadAll(r.Body)
	if err != nil {
		slog.Error("read webhook body", "error", err)
		InternalError(w)
		return
	}

	// 2. Verify HMAC-SHA256 signature.
	signature := r.Header.Get("X-Hub-Signature-256")
	if !service.VerifyWebhookSignature(body, signature, h.webhookSecret) {
		Unauthorized(w)
		return
	}

	// 3. Parse JSON payload.
	var payload struct {
		Action      string `json:"action"`
		PullRequest struct {
			Merged         bool   `json:"merged"`
			HTMLURL        string `json:"html_url"`
			MergeCommitSHA string `json:"merge_commit_sha"`
		} `json:"pull_request"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid JSON payload")
		return
	}

	// Only process closed+merged PRs.
	if payload.Action != "closed" || !payload.PullRequest.Merged {
		OK(w, map[string]any{"ignored": true, "reason": "not a merged PR"})
		return
	}

	prURL := payload.PullRequest.HTMLURL
	mergeCommitSHA := payload.PullRequest.MergeCommitSHA

	// 4. Find draw by PR URL.
	draw, err := h.queries.GetDrawByPRURL(ctx, pgtype.Text{String: prURL, Valid: true})
	if err != nil {
		// No matching draw — this PR is not tracked by GitFable.
		slog.Info("webhook: no draw found for PR URL", "pr_url", prURL)
		OK(w, map[string]any{"ignored": true, "reason": "no matching draw"})
		return
	}

	// Get issue data for the activity record.
	issue, err := h.queries.GetIssueByID(ctx, draw.IssueID)
	if err != nil {
		slog.Error("webhook: get issue for merge", "error", err)
		InternalError(w)
		return
	}

	// 5. Transaction: merge draw + award XP + increment contributions + update streak + check badges + create activity.
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		slog.Error("webhook: begin tx", "error", err)
		InternalError(w)
		return
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	// MergeDraw (status guard: only merges if still pr_submitted).
	mergedDraw, err := qtx.MergeDraw(ctx, database.MergeDrawParams{
		ID:             draw.ID,
		MergeCommitSha: pgtype.Text{String: mergeCommitSHA, Valid: mergeCommitSHA != ""},
		XpAwarded:      int32(webhookMergeXP),
		RewardSource:   pgtype.Text{String: "webhook", Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Already merged (e.g. via manual verify) or status changed — idempotent success.
			slog.Info("webhook: draw already merged or status changed", "draw_id", draw.ID)
			OK(w, map[string]any{"ignored": true, "reason": "draw already merged"})
			return
		}
		slog.Error("webhook: merge draw", "error", err)
		InternalError(w)
		return
	}

	// AwardXP.
	txXP := service.NewXPService(qtx)
	_, _, err = txXP.AwardXP(ctx, draw.UserID, webhookMergeXP)
	if err != nil {
		slog.Error("webhook: award merge xp", "error", err)
		InternalError(w)
		return
	}

	// IncrementContributions.
	err = qtx.IncrementContributions(ctx, draw.UserID)
	if err != nil {
		slog.Error("webhook: increment contributions", "error", err)
		InternalError(w)
		return
	}

	// UpdateStreak.
	txStreaks := service.NewStreakService(qtx)
	err = txStreaks.UpdateStreak(ctx, draw.UserID)
	if err != nil {
		slog.Error("webhook: update streak", "error", err)
		InternalError(w)
		return
	}

	// Get updated user for badge checks.
	updatedUser, err := qtx.GetUserByID(ctx, draw.UserID)
	if err != nil {
		slog.Error("webhook: get updated user", "error", err)
		InternalError(w)
		return
	}

	// CheckBadges.
	txBadges := service.NewBadgeService(qtx)
	newBadges, err := txBadges.CheckBadges(ctx, draw.UserID, service.BadgeUser{
		LongestStreak: updatedUser.LongestStreak,
	})
	if err != nil {
		slog.Error("webhook: check badges", "error", err)
		// Non-fatal: continue with the merge.
		newBadges = []string{}
	}

	// CreateActivity.
	_, err = qtx.CreateActivity(ctx, database.CreateActivityParams{
		UserID:    draw.UserID,
		DrawID:    pgtype.Int8{Int64: draw.ID, Valid: true},
		Action:    database.ActivityActionMerged,
		RepoOwner: pgtype.Text{String: issue.RepoOwner, Valid: true},
		RepoName:  pgtype.Text{String: issue.RepoName, Valid: true},
		Title:     pgtype.Text{String: issue.Title, Valid: true},
	})
	if err != nil {
		slog.Error("webhook: create activity", "error", err)
		InternalError(w)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("webhook: commit tx", "error", err)
		InternalError(w)
		return
	}

	// 6. Return success.
	OK(w, map[string]any{
		"draw_id":    uuidToString(mergedDraw.PublicID),
		"xp_awarded": webhookMergeXP,
		"new_badges": newBadges,
	})
}
