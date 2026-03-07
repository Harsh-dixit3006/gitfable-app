package handler

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nishantg96/gitfable/internal/ctxutil"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/service"
)

const (
	maxDrawsPerDay = 3
	defaultLimit   = 20
	maxLimit       = 100
	bookmarkXP     = 10
	drawXP         = 10
	chooseXP       = 5
	submitPRXP     = 25
	mergeXP        = 100
	bookmarkDays   = 7
)

type DrawHandler struct {
	pool        *pgxpool.Pool
	queries     *database.Queries
	requireAuth func(http.Handler) http.Handler
	xp          *service.XPService
	badges      *service.BadgeService
	streaks     *service.StreakService
	github      service.GitHubClient
}

func NewDrawHandler(
	pool *pgxpool.Pool,
	queries *database.Queries,
	requireAuth func(http.Handler) http.Handler,
	xp *service.XPService,
	badges *service.BadgeService,
	streaks *service.StreakService,
	github service.GitHubClient,
) *DrawHandler {
	return &DrawHandler{
		pool:        pool,
		queries:     queries,
		requireAuth: requireAuth,
		xp:          xp,
		badges:      badges,
		streaks:     streaks,
		github:      github,
	}
}

func (h *DrawHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.requireAuth)
	r.Post("/", h.Draw)
	r.Post("/choose", h.Choose)
	r.Put("/{id}/status", h.UpdateStatus)
	r.Put("/{id}/pr", h.SubmitPR)
	r.Post("/{id}/verify", h.Verify)
	r.Get("/history", h.History)
	return r
}

// Draw handles POST / — draw a random issue.
func (h *DrawHandler) Draw(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := ctxutil.UserFromContext(ctx)
	if user == nil {
		Unauthorized(w)
		return
	}

	// Check daily draw limit.
	count, err := h.queries.CountDrawsToday(ctx, user.ID)
	if err != nil {
		slog.Error("count draws today", "error", err)
		InternalError(w)
		return
	}
	if count >= maxDrawsPerDay {
		BadRequest(w, ErrCodeDrawLimitReached, "Daily draw limit reached (3 per day)")
		return
	}

	// Parse optional filters.
	var req struct {
		Language   *string `json:"language"`
		Difficulty *string `json:"difficulty"`
	}
	if r.Body != nil {
		_ = json.NewDecoder(r.Body).Decode(&req)
	}

	langParam := textFromPtr(req.Language)
	diffParam := textFromPtr(req.Difficulty)

	// Count matching issues, then pick a random offset.
	issueCount, err := h.queries.CountFilteredIssuesForUser(ctx, database.CountFilteredIssuesForUserParams{
		UserID:     user.ID,
		Language:   langParam,
		Difficulty: diffParam,
	})
	if err != nil {
		slog.Error("count filtered issues", "error", err)
		InternalError(w)
		return
	}
	if issueCount == 0 {
		NotFound(w, "No matching issues available")
		return
	}

	randOffset, _ := rand.Int(rand.Reader, big.NewInt(issueCount))

	issue, err := h.queries.GetRandomIssueForUser(ctx, database.GetRandomIssueForUserParams{
		UserID:     user.ID,
		Offset:     int32(randOffset.Int64()),
		Language:   langParam,
		Difficulty: diffParam,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			NotFound(w, "No matching issues available")
			return
		}
		slog.Error("get random issue", "error", err)
		InternalError(w)
		return
	}

	draw, err := h.queries.CreateDraw(ctx, database.CreateDrawParams{
		UserID:  user.ID,
		IssueID: issue.ID,
		Source:  "draw",
	})
	if err != nil {
		slog.Error("create draw", "error", err)
		InternalError(w)
		return
	}

	// Award XP (best effort).
	_, _, err = h.xp.AwardXP(ctx, user.ID, drawXP)
	if err != nil {
		slog.Error("award draw xp", "error", err)
	}

	remaining := maxDrawsPerDay - int(count) - 1
	Created(w, map[string]any{
		"draw":            drawToResponse(draw),
		"issue":           issueToResponse(issue),
		"remaining_draws": remaining,
	})
}

// Choose handles POST /choose — choose a specific issue.
func (h *DrawHandler) Choose(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := ctxutil.UserFromContext(ctx)
	if user == nil {
		Unauthorized(w)
		return
	}

	// Check daily draw limit (shared with Draw).
	count, err := h.queries.CountDrawsToday(ctx, user.ID)
	if err != nil {
		slog.Error("count draws today", "error", err)
		InternalError(w)
		return
	}
	if count >= maxDrawsPerDay {
		BadRequest(w, ErrCodeDrawLimitReached, "Daily draw limit reached (3 per day)")
		return
	}

	var req struct {
		IssueID string `json:"issue_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid request body")
		return
	}
	if req.IssueID == "" {
		BadRequest(w, ErrCodeBadRequest, "issue_id is required")
		return
	}

	issuePublicID, err := parseUUID(req.IssueID)
	if err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid issue_id format")
		return
	}

	issue, err := h.queries.GetIssueByPublicID(ctx, issuePublicID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			NotFound(w, "Issue not found")
			return
		}
		slog.Error("get issue by public id", "error", err)
		InternalError(w)
		return
	}

	if issue.State != database.IssueStateOpen {
		BadRequest(w, ErrCodeBadRequest, "Issue is no longer open")
		return
	}

	draw, err := h.queries.CreateDraw(ctx, database.CreateDrawParams{
		UserID:  user.ID,
		IssueID: issue.ID,
		Source:  "choose",
	})
	if err != nil {
		slog.Error("create draw", "error", err)
		InternalError(w)
		return
	}

	// Award XP (best effort).
	_, _, err = h.xp.AwardXP(ctx, user.ID, chooseXP)
	if err != nil {
		slog.Error("award choose xp", "error", err)
	}

	Created(w, map[string]any{
		"draw":  drawToResponse(draw),
		"issue": issueToResponse(issue),
	})
}

// UpdateStatus handles PUT /{id}/status — transition draw state.
func (h *DrawHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := ctxutil.UserFromContext(ctx)
	if user == nil {
		Unauthorized(w)
		return
	}

	drawPublicID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid draw ID")
		return
	}

	var req struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid request body")
		return
	}

	draw, err := h.queries.GetDrawByPublicIDAndUser(ctx, database.GetDrawByPublicIDAndUserParams{
		PublicID: drawPublicID,
		UserID:  user.ID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			NotFound(w, "Draw not found")
			return
		}
		slog.Error("get draw", "error", err)
		InternalError(w)
		return
	}

	targetStatus := database.DrawStatus(req.Status)

	// Validate state transitions.
	if !isValidTransition(draw.Status, targetStatus) {
		BadRequest(w, ErrCodeInvalidStatus, fmt.Sprintf(
			"Cannot transition from %s to %s", draw.Status, targetStatus))
		return
	}

	var updatedDraw database.Draw

	switch targetStatus {
	case database.DrawStatusBookmarked:
		// Check no existing active bookmark.
		_, err := h.queries.GetActiveBookmark(ctx, user.ID)
		if err == nil {
			BadRequest(w, ErrCodeBookmarkExists, "You already have an active bookmark")
			return
		}
		if !errors.Is(err, pgx.ErrNoRows) {
			slog.Error("get active bookmark", "error", err)
			InternalError(w)
			return
		}

		expiresAt := pgtype.Timestamptz{
			Time:  time.Now().Add(bookmarkDays * 24 * time.Hour),
			Valid: true,
		}
		updatedDraw, err = h.queries.BookmarkDraw(ctx, database.BookmarkDrawParams{
			ID:        draw.ID,
			ExpiresAt: expiresAt,
		})
		if err != nil {
			slog.Error("bookmark draw", "error", err)
			InternalError(w)
			return
		}

		// Award XP for bookmarking (best effort).
		_, _, xpErr := h.xp.AwardXP(ctx, user.ID, bookmarkXP)
		if xpErr != nil {
			slog.Error("award bookmark xp", "error", xpErr)
		}

	case database.DrawStatusExpired, database.DrawStatusAbandoned:
		updatedDraw, err = h.queries.UpdateDrawStatus(ctx, database.UpdateDrawStatusParams{
			ID:            draw.ID,
			Status:        targetStatus,
			CurrentStatus: draw.Status,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				BadRequest(w, ErrCodeInvalidStatus, "Draw status has changed, please refresh")
				return
			}
			slog.Error("update draw status", "error", err)
			InternalError(w)
			return
		}

	default:
		BadRequest(w, ErrCodeInvalidStatus, "Unsupported target status")
		return
	}

	OK(w, map[string]any{
		"draw": drawToResponse(updatedDraw),
	})
}

// SubmitPR handles PUT /{id}/pr — submit a PR URL for a draw.
func (h *DrawHandler) SubmitPR(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := ctxutil.UserFromContext(ctx)
	if user == nil {
		Unauthorized(w)
		return
	}

	drawPublicID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid draw ID")
		return
	}

	var req struct {
		PRURL string `json:"pr_url"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid request body")
		return
	}

	// Validate PR URL format.
	_, _, _, err = service.ParsePRURL(req.PRURL)
	if err != nil {
		BadRequest(w, ErrCodeInvalidPRURL, "Invalid GitHub PR URL")
		return
	}

	draw, err := h.queries.GetDrawByPublicIDAndUser(ctx, database.GetDrawByPublicIDAndUserParams{
		PublicID: drawPublicID,
		UserID:  user.ID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			NotFound(w, "Draw not found")
			return
		}
		slog.Error("get draw", "error", err)
		InternalError(w)
		return
	}

	if draw.Status != database.DrawStatusBookmarked {
		BadRequest(w, ErrCodeInvalidStatus, "Draw must be bookmarked to submit a PR")
		return
	}

	updatedDraw, err := h.queries.SubmitPR(ctx, database.SubmitPRParams{
		ID:    draw.ID,
		PrUrl: pgtype.Text{String: req.PRURL, Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			BadRequest(w, ErrCodeInvalidStatus, "Draw status has changed, please refresh")
			return
		}
		slog.Error("submit pr", "error", err)
		InternalError(w)
		return
	}

	// Award XP (best effort).
	_, _, err = h.xp.AwardXP(ctx, user.ID, submitPRXP)
	if err != nil {
		slog.Error("award submit pr xp", "error", err)
	}

	OK(w, map[string]any{
		"draw": drawToResponse(updatedDraw),
	})
}

// Verify handles POST /{id}/verify — verify a PR is merged via GitHub API.
func (h *DrawHandler) Verify(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := ctxutil.UserFromContext(ctx)
	if user == nil {
		Unauthorized(w)
		return
	}

	drawPublicID, err := parseUUID(chi.URLParam(r, "id"))
	if err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid draw ID")
		return
	}

	draw, err := h.queries.GetDrawByPublicIDAndUser(ctx, database.GetDrawByPublicIDAndUserParams{
		PublicID: drawPublicID,
		UserID:  user.ID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			NotFound(w, "Draw not found")
			return
		}
		slog.Error("get draw", "error", err)
		InternalError(w)
		return
	}

	if draw.Status != database.DrawStatusPrSubmitted {
		BadRequest(w, ErrCodeInvalidStatus, "Draw must have a submitted PR to verify")
		return
	}

	if !draw.PrUrl.Valid {
		BadRequest(w, ErrCodeInvalidPRURL, "No PR URL found on this draw")
		return
	}

	owner, repo, number, err := service.ParsePRURL(draw.PrUrl.String)
	if err != nil {
		BadRequest(w, ErrCodeInvalidPRURL, "Invalid PR URL stored on draw")
		return
	}

	prStatus, err := h.github.GetPRStatus(ctx, owner, repo, number)
	if err != nil {
		slog.Error("get pr status", "error", err)
		InternalError(w)
		return
	}

	if !prStatus.Merged {
		OK(w, map[string]any{
			"verified":   false,
			"pr_state":   prStatus.State,
			"pr_merged":  false,
			"new_badges": []string{},
		})
		return
	}

	// PR is merged — perform transactional updates.
	issue, err := h.queries.GetIssueByID(ctx, draw.IssueID)
	if err != nil {
		slog.Error("get issue for merge", "error", err)
		InternalError(w)
		return
	}

	tx, err := h.pool.Begin(ctx)
	if err != nil {
		slog.Error("begin tx", "error", err)
		InternalError(w)
		return
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	// Merge the draw (status guard: only merges if still pr_submitted).
	mergedDraw, err := qtx.MergeDraw(ctx, database.MergeDrawParams{
		ID:             draw.ID,
		MergeCommitSha: pgtype.Text{String: prStatus.MergeCommitSHA, Valid: prStatus.MergeCommitSHA != ""},
		XpAwarded:      int32(mergeXP),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			BadRequest(w, ErrCodeInvalidStatus, "Draw has already been merged or status changed")
			return
		}
		slog.Error("merge draw", "error", err)
		InternalError(w)
		return
	}

	// Award XP within transaction using a tx-backed XP service.
	txXP := service.NewXPService(qtx)
	_, _, err = txXP.AwardXP(ctx, user.ID, mergeXP)
	if err != nil {
		slog.Error("award merge xp", "error", err)
		InternalError(w)
		return
	}

	// Increment contributions.
	err = qtx.IncrementContributions(ctx, user.ID)
	if err != nil {
		slog.Error("increment contributions", "error", err)
		InternalError(w)
		return
	}

	// Update streak.
	txStreaks := service.NewStreakService(qtx)
	err = txStreaks.UpdateStreak(ctx, user.ID)
	if err != nil {
		slog.Error("update streak", "error", err)
		InternalError(w)
		return
	}

	// Get updated user for badge checks.
	updatedUser, err := qtx.GetUserByID(ctx, user.ID)
	if err != nil {
		slog.Error("get updated user", "error", err)
		InternalError(w)
		return
	}

	// Check badges.
	txBadges := service.NewBadgeService(qtx)
	newBadges, err := txBadges.CheckBadges(ctx, user.ID, service.BadgeUser{
		LongestStreak: updatedUser.LongestStreak,
	})
	if err != nil {
		slog.Error("check badges", "error", err)
		// Non-fatal: continue with the merge.
		newBadges = []string{}
	}

	// Create activity.
	_, err = qtx.CreateActivity(ctx, database.CreateActivityParams{
		UserID:    user.ID,
		DrawID:    pgtype.Int8{Int64: draw.ID, Valid: true},
		Action:    database.ActivityActionMerged,
		RepoOwner: pgtype.Text{String: issue.RepoOwner, Valid: true},
		RepoName:  pgtype.Text{String: issue.RepoName, Valid: true},
		Title:     pgtype.Text{String: issue.Title, Valid: true},
	})
	if err != nil {
		slog.Error("create activity", "error", err)
		InternalError(w)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("commit tx", "error", err)
		InternalError(w)
		return
	}

	OK(w, map[string]any{
		"verified":   true,
		"pr_state":   prStatus.State,
		"pr_merged":  true,
		"draw":       drawToResponse(mergedDraw),
		"new_badges": newBadges,
	})
}

// History handles GET /history — list draw history with cursor pagination.
func (h *DrawHandler) History(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := ctxutil.UserFromContext(ctx)
	if user == nil {
		Unauthorized(w)
		return
	}

	limit := parseLimit(r.URL.Query().Get("limit"))
	cursor := r.URL.Query().Get("cursor")
	statusFilter := r.URL.Query().Get("status")

	// If status filter is provided, use the status-specific query (no cursor support).
	if statusFilter != "" {
		draws, err := h.queries.ListUserDrawsByStatus(ctx, database.ListUserDrawsByStatusParams{
			UserID: user.ID,
			Status: database.DrawStatus(statusFilter),
			Limit:  int32(limit),
		})
		if err != nil {
			slog.Error("list user draws by status", "error", err)
			InternalError(w)
			return
		}
		items := drawRowsToResponse(draws)
		nextCursor := ""
		hasMore := len(draws) == limit
		if hasMore && len(draws) > 0 {
			last := draws[len(draws)-1]
			nextCursor = encodeCursor(last.CreatedAt, last.ID)
		}
		OKList(w, items, nextCursor, hasMore)
		return
	}

	if cursor != "" {
		cursorTime, cursorID, err := decodeCursor(cursor)
		if err != nil {
			BadRequest(w, ErrCodeBadRequest, "Invalid cursor")
			return
		}

		draws, err := h.queries.ListUserDrawsAfterCursor(ctx, database.ListUserDrawsAfterCursorParams{
			UserID:    user.ID,
			CreatedAt: pgtype.Timestamptz{Time: cursorTime, Valid: true},
			CursorID:  cursorID,
			Limit:     int32(limit),
		})
		if err != nil {
			slog.Error("list user draws after cursor", "error", err)
			InternalError(w)
			return
		}

		items := drawAfterCursorRowsToResponse(draws)
		nextCursor := ""
		hasMore := len(draws) == limit
		if hasMore && len(draws) > 0 {
			last := draws[len(draws)-1]
			nextCursor = encodeCursor(last.CreatedAt, last.ID)
		}
		OKList(w, items, nextCursor, hasMore)
		return
	}

	// No cursor — first page.
	draws, err := h.queries.ListUserDraws(ctx, database.ListUserDrawsParams{
		UserID: user.ID,
		Limit:  int32(limit),
	})
	if err != nil {
		slog.Error("list user draws", "error", err)
		InternalError(w)
		return
	}

	items := drawListRowsToResponse(draws)
	nextCursor := ""
	hasMore := len(draws) == limit
	if hasMore && len(draws) > 0 {
		last := draws[len(draws)-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
	}
	OKList(w, items, nextCursor, hasMore)
}

// --- Helper functions ---

func isValidTransition(from, to database.DrawStatus) bool {
	switch to {
	case database.DrawStatusBookmarked:
		return from == database.DrawStatusDrawn
	case database.DrawStatusExpired:
		return from == database.DrawStatusBookmarked
	case database.DrawStatusAbandoned:
		// Can abandon from any non-terminal state.
		return from == database.DrawStatusDrawn ||
			from == database.DrawStatusBookmarked ||
			from == database.DrawStatusPrSubmitted
	default:
		return false
	}
}

func parseUUID(s string) (pgtype.UUID, error) {
	parsed, err := uuid.Parse(s)
	if err != nil {
		return pgtype.UUID{}, err
	}
	return pgtype.UUID{Bytes: parsed, Valid: true}, nil
}

func textFromPtr(s *string) pgtype.Text {
	if s == nil || *s == "" {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: *s, Valid: true}
}

func textToPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

func timestampToPtr(t pgtype.Timestamptz) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.Format(time.RFC3339)
	return &s
}

func drawToResponse(d database.Draw) map[string]any {
	resp := map[string]any{
		"id":         uuidToString(d.PublicID),
		"status":     string(d.Status),
		"source":     d.Source,
		"xp_awarded": d.XpAwarded,
		"created_at": timestampToPtr(d.CreatedAt),
		"updated_at": timestampToPtr(d.UpdatedAt),
	}
	if d.PrUrl.Valid {
		resp["pr_url"] = d.PrUrl.String
	}
	if d.PrSubmittedAt.Valid {
		resp["pr_submitted_at"] = d.PrSubmittedAt.Time.Format(time.RFC3339)
	}
	if d.MergeCommitSha.Valid {
		resp["merge_commit_sha"] = d.MergeCommitSha.String
	}
	if d.MergedAt.Valid {
		resp["merged_at"] = d.MergedAt.Time.Format(time.RFC3339)
	}
	if d.ExpiresAt.Valid {
		resp["expires_at"] = d.ExpiresAt.Time.Format(time.RFC3339)
	}
	return resp
}

func issueToResponse(i database.Issue) map[string]any {
	resp := map[string]any{
		"id":         uuidToString(i.PublicID),
		"repo_owner": i.RepoOwner,
		"repo_name":  i.RepoName,
		"title":      i.Title,
		"url":        i.Url,
		"repo_stars": i.RepoStars,
		"labels":     i.Labels,
		"state":      string(i.State),
	}
	if i.Language.Valid {
		resp["language"] = i.Language.String
	}
	if i.Difficulty.Valid {
		resp["difficulty"] = i.Difficulty.String
	}
	return resp
}

func drawListRowToResponse(d database.ListUserDrawsRow) map[string]any {
	resp := map[string]any{
		"id":         uuidToString(d.PublicID),
		"status":     string(d.Status),
		"source":     d.Source,
		"xp_awarded": d.XpAwarded,
		"created_at": timestampToPtr(d.CreatedAt),
		"updated_at": timestampToPtr(d.UpdatedAt),
		"issue": map[string]any{
			"id":         uuidToString(d.IssuePublicID),
			"repo_owner": d.RepoOwner,
			"repo_name":  d.RepoName,
			"title":      d.IssueTitle,
			"url":        d.IssueUrl,
			"language":   textToPtr(d.IssueLanguage),
			"difficulty": textToPtr(d.IssueDifficulty),
			"repo_stars": d.IssueRepoStars,
			"labels":     d.IssueLabels,
		},
	}
	if d.PrUrl.Valid {
		resp["pr_url"] = d.PrUrl.String
	}
	if d.ExpiresAt.Valid {
		resp["expires_at"] = d.ExpiresAt.Time.Format(time.RFC3339)
	}
	if d.MergedAt.Valid {
		resp["merged_at"] = d.MergedAt.Time.Format(time.RFC3339)
	}
	return resp
}

func drawListRowsToResponse(draws []database.ListUserDrawsRow) []map[string]any {
	items := make([]map[string]any, len(draws))
	for i, d := range draws {
		items[i] = drawListRowToResponse(d)
	}
	return items
}

func drawStatusRowToResponse(d database.ListUserDrawsByStatusRow) map[string]any {
	resp := map[string]any{
		"id":         uuidToString(d.PublicID),
		"status":     string(d.Status),
		"source":     d.Source,
		"xp_awarded": d.XpAwarded,
		"created_at": timestampToPtr(d.CreatedAt),
		"updated_at": timestampToPtr(d.UpdatedAt),
		"issue": map[string]any{
			"id":         uuidToString(d.IssuePublicID),
			"repo_owner": d.RepoOwner,
			"repo_name":  d.RepoName,
			"title":      d.IssueTitle,
			"url":        d.IssueUrl,
			"language":   textToPtr(d.IssueLanguage),
			"difficulty": textToPtr(d.IssueDifficulty),
			"repo_stars": d.IssueRepoStars,
			"labels":     d.IssueLabels,
		},
	}
	if d.PrUrl.Valid {
		resp["pr_url"] = d.PrUrl.String
	}
	if d.ExpiresAt.Valid {
		resp["expires_at"] = d.ExpiresAt.Time.Format(time.RFC3339)
	}
	if d.MergedAt.Valid {
		resp["merged_at"] = d.MergedAt.Time.Format(time.RFC3339)
	}
	return resp
}

func drawRowsToResponse(draws []database.ListUserDrawsByStatusRow) []map[string]any {
	items := make([]map[string]any, len(draws))
	for i, d := range draws {
		items[i] = drawStatusRowToResponse(d)
	}
	return items
}

func drawAfterCursorRowToResponse(d database.ListUserDrawsAfterCursorRow) map[string]any {
	resp := map[string]any{
		"id":         uuidToString(d.PublicID),
		"status":     string(d.Status),
		"source":     d.Source,
		"xp_awarded": d.XpAwarded,
		"created_at": timestampToPtr(d.CreatedAt),
		"updated_at": timestampToPtr(d.UpdatedAt),
		"issue": map[string]any{
			"id":         uuidToString(d.IssuePublicID),
			"repo_owner": d.RepoOwner,
			"repo_name":  d.RepoName,
			"title":      d.IssueTitle,
			"url":        d.IssueUrl,
			"language":   textToPtr(d.IssueLanguage),
			"difficulty": textToPtr(d.IssueDifficulty),
			"repo_stars": d.IssueRepoStars,
			"labels":     d.IssueLabels,
		},
	}
	if d.PrUrl.Valid {
		resp["pr_url"] = d.PrUrl.String
	}
	if d.ExpiresAt.Valid {
		resp["expires_at"] = d.ExpiresAt.Time.Format(time.RFC3339)
	}
	if d.MergedAt.Valid {
		resp["merged_at"] = d.MergedAt.Time.Format(time.RFC3339)
	}
	return resp
}

func drawAfterCursorRowsToResponse(draws []database.ListUserDrawsAfterCursorRow) []map[string]any {
	items := make([]map[string]any, len(draws))
	for i, d := range draws {
		items[i] = drawAfterCursorRowToResponse(d)
	}
	return items
}

func encodeCursor(createdAt pgtype.Timestamptz, id int64) string {
	if !createdAt.Valid {
		return ""
	}
	raw := fmt.Sprintf("%s,%d", createdAt.Time.Format(time.RFC3339Nano), id)
	return base64.StdEncoding.EncodeToString([]byte(raw))
}

func decodeCursor(cursor string) (time.Time, int64, error) {
	raw, err := base64.StdEncoding.DecodeString(cursor)
	if err != nil {
		return time.Time{}, 0, err
	}

	parts := strings.SplitN(string(raw), ",", 2)
	if len(parts) != 2 {
		return time.Time{}, 0, fmt.Errorf("invalid cursor format")
	}

	t, err := time.Parse(time.RFC3339Nano, parts[0])
	if err != nil {
		return time.Time{}, 0, err
	}

	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return time.Time{}, 0, err
	}

	return t, id, nil
}

func parseLimit(s string) int {
	if s == "" {
		return defaultLimit
	}
	n, err := strconv.Atoi(s)
	if err != nil || n < 1 {
		return defaultLimit
	}
	if n > maxLimit {
		return maxLimit
	}
	return n
}
