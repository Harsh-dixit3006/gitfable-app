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
	maxDrawRetries     = 3
	defaultLimit       = 20
	maxLimit           = 100
	bookmarkXP         = 5
	submitPRXP         = 25
	bookmarkDays       = 7
	maxActiveBookmarks = 5
)

// Browse — choose is free, XP only on merge.
var browseMergeXPByRarity = map[string]int{
	"common": 25, "rare": 50, "epic": 100,
}

// Draw (3x) — random card draw with rarity surprise.
var drawXPByRarity = map[string]int{
	"common": 5, "rare": 15, "epic": 30, "legendary": 50,
}
var drawMergeXPByRarity = map[string]int{
	"common": 75, "rare": 150, "epic": 300, "legendary": 500,
}

// Weighted draw probabilities (out of 100).
// 40% Common, 30% Rare, 20% Epic, 10% Legendary.
var rarityWeights = []struct {
	rarity string
	weight int
}{
	{"legendary", 10},
	{"epic", 20},
	{"rare", 30},
	{"common", 40},
}

type DrawHandler struct {
	pool                  *pgxpool.Pool
	queries               *database.Queries
	requireAuth           func(http.Handler) http.Handler
	xp                    *service.XPService
	badges                *service.BadgeService
	streaks               *service.StreakService
	github                service.GitHubClient
	issueChecker          *service.IssueChecker
	defaultDailyDrawLimit int
}

func NewDrawHandler(
	pool *pgxpool.Pool,
	queries *database.Queries,
	requireAuth func(http.Handler) http.Handler,
	xp *service.XPService,
	badges *service.BadgeService,
	streaks *service.StreakService,
	github service.GitHubClient,
	issueChecker *service.IssueChecker,
	defaultDailyDrawLimit int,
) *DrawHandler {
	return &DrawHandler{
		pool:                  pool,
		queries:               queries,
		requireAuth:           requireAuth,
		xp:                    xp,
		badges:                badges,
		streaks:               streaks,
		github:                github,
		issueChecker:          issueChecker,
		defaultDailyDrawLimit: defaultDailyDrawLimit,
	}
}

func effectiveDailyDrawLimit(user database.User, fallback int) int {
	if user.DailyDrawLimit.Valid && user.DailyDrawLimit.Int32 > 0 {
		return int(user.DailyDrawLimit.Int32)
	}
	return fallback
}

func remainingDraws(limit, used int) int {
	remaining := limit - used
	if remaining < 0 {
		return 0
	}
	return remaining
}

func (h *DrawHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Use(h.requireAuth)
	r.Post("/", h.Draw)
	r.Post("/choose", h.Choose)
	r.Put("/{id}/status", h.UpdateStatus)
	r.Put("/{id}/pr", h.SubmitPR)
	r.Post("/{id}/verify", h.Verify)
	r.Post("/{id}/reactivate", h.Reactivate)
	r.Get("/history", h.History)
	return r
}

// Draw handles POST / — draw a random issue using weighted rarity selection.
func (h *DrawHandler) Draw(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := ctxutil.UserFromContext(ctx)
	if user == nil {
		Unauthorized(w)
		return
	}

	dailyDrawLimit := effectiveDailyDrawLimit(*user, h.defaultDailyDrawLimit)

	// Check daily draw limit.
	count, err := h.queries.CountDrawsToday(ctx, user.ID)
	if err != nil {
		slog.Error("count draws today", "error", err)
		InternalError(w)
		return
	}
	if count >= int64(dailyDrawLimit) {
		BadRequest(w, ErrCodeDrawLimitReached, fmt.Sprintf("Daily draw limit reached (%d per day)", dailyDrawLimit))
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

	// Get available issue counts per rarity tier.
	rarityCounts, err := h.queries.CountIssuesByRarityForUser(ctx, database.CountIssuesByRarityForUserParams{
		UserID:     user.ID,
		Language:   langParam,
		Difficulty: diffParam,
	})
	if err != nil {
		slog.Error("count issues by rarity", "error", err)
		InternalError(w)
		return
	}

	countByRarity := make(map[string]int64)
	for _, rc := range rarityCounts {
		countByRarity[rc.Rarity] = rc.Count
	}

	totalAvailable := int64(0)
	for _, c := range countByRarity {
		totalAvailable += c
	}
	if totalAvailable == 0 {
		NotFound(w, "No matching issues available")
		return
	}

	// Pick a rarity tier using weighted random selection.
	// If the chosen tier is empty, cascade to the next lower tier.
	selectedRarity := pickRarityTier(countByRarity)

	// Try up to maxDrawRetries times to find a fresh issue of this rarity.
	var issue database.Issue
	for attempt := range maxDrawRetries {
		tierCount := countByRarity[selectedRarity]
		if tierCount == 0 {
			break
		}

		randOffset, _ := rand.Int(rand.Reader, big.NewInt(tierCount))

		candidate, err := h.queries.GetRandomIssueByRarityForUser(ctx, database.GetRandomIssueByRarityForUserParams{
			Rarity:     selectedRarity,
			UserID:     user.ID,
			Offset:     int32(randOffset.Int64()),
			Language:   langParam,
			Difficulty: diffParam,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				break
			}
			slog.Error("get random issue by rarity", "error", err)
			InternalError(w)
			return
		}

		// Freshness check.
		open, err := h.issueChecker.IsOpen(ctx, candidate.RepoOwner, candidate.RepoName, candidate.GithubNumber)
		if err != nil {
			slog.Warn("issue freshness check failed, proceeding anyway", "error", err, "url", candidate.Url)
			issue = candidate
			break
		}
		if open {
			issue = candidate
			break
		}

		slog.Info("draw-time freshness: marking issue closed", "url", candidate.Url, "attempt", attempt+1)
		if err := h.queries.MarkIssueClosed(ctx, candidate.ID); err != nil {
			slog.Error("mark issue closed", "error", err)
		}
		countByRarity[selectedRarity]--
	}

	if issue.ID == 0 {
		NotFound(w, "No fresh issues available — please try again shortly")
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

	// Award rarity-based XP.
	xpReward := drawXPByRarity[issue.Rarity]
	if xpReward == 0 {
		xpReward = drawXPByRarity["common"]
	}
	_, _, err = h.xp.AwardXP(ctx, user.ID, xpReward)
	if err != nil {
		slog.Error("award draw xp", "error", err)
	}

	remaining := remainingDraws(dailyDrawLimit, int(count)+1)
	Created(w, map[string]any{
		"draw":              drawToResponse(draw),
		"issue":             issueToResponse(issue),
		"remaining_draws":   remaining,
		"max_draws_per_day": dailyDrawLimit,
		"xp_awarded":        xpReward,
	})
}

// pickRarityTier selects a rarity tier using weighted random, cascading
// to the next available tier if the selected one has no issues.
func pickRarityTier(countByRarity map[string]int64) string {
	// Roll 1-100.
	roll, _ := rand.Int(rand.Reader, big.NewInt(100))
	n := int(roll.Int64())

	cumulative := 0
	selected := "common"
	for _, rw := range rarityWeights {
		cumulative += rw.weight
		if n < cumulative {
			selected = rw.rarity
			break
		}
	}

	// If selected tier is empty, cascade downward.
	if countByRarity[selected] > 0 {
		return selected
	}

	// Cascade order: legendary -> epic -> rare -> common.
	cascade := []string{"legendary", "epic", "rare", "common"}
	startIdx := 0
	for i, r := range cascade {
		if r == selected {
			startIdx = i
			break
		}
	}
	for i := startIdx; i < len(cascade); i++ {
		if countByRarity[cascade[i]] > 0 {
			return cascade[i]
		}
	}
	// If nothing below, try above.
	for i := startIdx - 1; i >= 0; i-- {
		if countByRarity[cascade[i]] > 0 {
			return cascade[i]
		}
	}
	return "common"
}

// Choose handles POST /choose — choose a specific issue.
func (h *DrawHandler) Choose(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := ctxutil.UserFromContext(ctx)
	if user == nil {
		Unauthorized(w)
		return
	}

	dailyDrawLimit := effectiveDailyDrawLimit(*user, h.defaultDailyDrawLimit)

	// Check daily draw limit (shared with Draw).
	count, err := h.queries.CountDrawsToday(ctx, user.ID)
	if err != nil {
		slog.Error("count draws today", "error", err)
		InternalError(w)
		return
	}
	if count >= int64(dailyDrawLimit) {
		BadRequest(w, ErrCodeDrawLimitReached, fmt.Sprintf("Daily draw limit reached (%d per day)", dailyDrawLimit))
		return
	}

	var req struct {
		IssueID             string `json:"issue_id"`
		BookmarkImmediately bool   `json:"bookmark_immediately"`
		ReplaceDrawID       string `json:"replace_draw_id"`
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

	open, err := h.issueChecker.IsOpen(ctx, issue.RepoOwner, issue.RepoName, issue.GithubNumber)
	if err != nil {
		slog.Warn("choose-time freshness check failed, proceeding anyway", "error", err, "url", issue.Url)
	} else if !open {
		BadRequest(w, ErrCodeBadRequest, "Issue is no longer available")
		return
	}

	var draw database.Draw
	if req.BookmarkImmediately {
		activeWork, err := h.queries.ListActiveWorkForUser(ctx, user.ID)
		if err != nil {
			slog.Error("list active work", "error", err)
			InternalError(w)
			return
		}
		if hasDuplicateActiveIssue(issue.ID, activeWork) {
			BadRequest(w, ErrCodeBookmarkExists, "This issue is already in your active work queue")
			return
		}

		activeCount, err := h.queries.CountActiveWorkForUser(ctx, user.ID)
		if err != nil {
			slog.Error("count active work", "error", err)
			InternalError(w)
			return
		}

		if activeBookmarkLimitReached(activeCount) && req.ReplaceDrawID == "" {
			respondBookmarkLimitReached(w, activeWork)
			return
		}

		tx, err := h.pool.Begin(ctx)
		if err != nil {
			slog.Error("begin choose tx", "error", err)
			InternalError(w)
			return
		}
		defer tx.Rollback(ctx)

		qtx := h.queries.WithTx(tx)
		draw, err = qtx.CreateDraw(ctx, database.CreateDrawParams{
			UserID:  user.ID,
			IssueID: issue.ID,
			Source:  "choose",
		})
		if err != nil {
			slog.Error("create draw", "error", err)
			InternalError(w)
			return
		}

		if req.ReplaceDrawID != "" {
			replacePublicID, err := parseUUID(req.ReplaceDrawID)
			if err != nil {
				BadRequest(w, ErrCodeBadRequest, "Invalid replace_draw_id format")
				return
			}
			replaceDraw, err := qtx.GetDrawByPublicIDAndUser(ctx, database.GetDrawByPublicIDAndUserParams{PublicID: replacePublicID, UserID: user.ID})
			if err != nil {
				if errors.Is(err, pgx.ErrNoRows) {
					NotFound(w, "Replacement draw not found")
					return
				}
				slog.Error("get replacement draw", "error", err)
				InternalError(w)
				return
			}
			if !isSwappableActiveStatus(replaceDraw.Status) {
				BadRequest(w, ErrCodeInvalidStatus, "Replacement draw is not swappable")
				return
			}
			if _, err := qtx.UpdateDrawStatus(ctx, database.UpdateDrawStatusParams{ID: replaceDraw.ID, Status: database.DrawStatusExpired, CurrentStatus: replaceDraw.Status}); err != nil {
				slog.Error("expire replacement draw", "error", err)
				InternalError(w)
				return
			}
		}

		_, expiresAt := chooseStatusAndExpiry(true, time.Now())
		draw, err = qtx.BookmarkDraw(ctx, database.BookmarkDrawParams{ID: draw.ID, ExpiresAt: expiresAt})
		if err != nil {
			slog.Error("bookmark chosen draw", "error", err)
			InternalError(w)
			return
		}
		if err := tx.Commit(ctx); err != nil {
			slog.Error("commit choose tx", "error", err)
			InternalError(w)
			return
		}
	} else {
		draw, err = h.queries.CreateDraw(ctx, database.CreateDrawParams{
			UserID:  user.ID,
			IssueID: issue.ID,
			Source:  "choose",
		})
		if err != nil {
			slog.Error("create draw", "error", err)
			InternalError(w)
			return
		}
	}

	Created(w, map[string]any{
		"draw":              drawToResponse(draw),
		"issue":             issueToResponse(issue),
		"remaining_draws":   remainingDraws(dailyDrawLimit, int(count)+1),
		"max_draws_per_day": dailyDrawLimit,
		"xp_awarded":        0,
	})
}

func chooseStatusAndExpiry(bookmarkImmediately bool, now time.Time) (database.DrawStatus, pgtype.Timestamptz) {
	if bookmarkImmediately {
		return database.DrawStatusBookmarked, pgtype.Timestamptz{Time: now.AddDate(0, 0, bookmarkDays), Valid: true}
	}
	return database.DrawStatusDrawn, pgtype.Timestamptz{}
}

func activeBookmarkLimitReached(activeCount int64) bool {
	return activeCount >= maxActiveBookmarks
}

func isSwappableActiveStatus(status database.DrawStatus) bool {
	return status == database.DrawStatusBookmarked || status == database.DrawStatusPrSubmitted
}

func hasDuplicateActiveIssue(issueID int64, activeWork []database.ListActiveWorkForUserRow) bool {
	for _, item := range activeWork {
		if item.IssueID == issueID {
			return true
		}
	}
	return false
}

func respondBookmarkLimitReached(w http.ResponseWriter, activeWork []database.ListActiveWorkForUserRow) {
	writeJSON(w, http.StatusBadRequest, Response{
		Data: map[string]any{
			"active_work": drawActiveWorkRowsToResponse(activeWork),
			"limit":       maxActiveBookmarks,
		},
		Error: &APIError{Code: ErrCodeBookmarkLimitReached, Message: fmt.Sprintf("Active bookmark limit reached (%d max)", maxActiveBookmarks)},
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
		UserID:   user.ID,
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
		activeWork, err := h.queries.ListActiveWorkForUser(ctx, user.ID)
		if err != nil {
			slog.Error("list active work", "error", err)
			InternalError(w)
			return
		}
		if hasDuplicateActiveIssue(draw.IssueID, activeWork) {
			BadRequest(w, ErrCodeBookmarkExists, "This issue is already in your active work queue")
			return
		}

		activeCount, err := h.queries.CountActiveWorkForUser(ctx, user.ID)
		if err != nil {
			slog.Error("count active work", "error", err)
			InternalError(w)
			return
		}
		if activeBookmarkLimitReached(activeCount) {
			respondBookmarkLimitReached(w, activeWork)
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
	prOwner, prRepo, prNumber, err := service.ParsePRURL(req.PRURL)
	if err != nil {
		BadRequest(w, ErrCodeInvalidPRURL, "Invalid GitHub PR URL")
		return
	}

	draw, err := h.queries.GetDrawByPublicIDAndUser(ctx, database.GetDrawByPublicIDAndUserParams{
		PublicID: drawPublicID,
		UserID:   user.ID,
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

	issue, err := h.queries.GetIssueByID(ctx, draw.IssueID)
	if err != nil {
		slog.Error("get issue for submit pr", "error", err)
		InternalError(w)
		return
	}

	prStatus, err := h.github.GetPRStatus(ctx, prOwner, prRepo, prNumber)
	if err != nil {
		slog.Error("get pr status for submit pr", "error", err)
		apiErr := mapPRVerificationError(err)
		Error(w, http.StatusBadRequest, apiErr.Code, apiErr.Message)
		return
	}

	var conflictingClaim *database.Draw
	claim, err := h.queries.GetActivePRClaimByIssue(ctx, database.GetActivePRClaimByIssueParams{
		IssueID: issue.ID,
		UserID:  user.ID,
	})
	if err == nil {
		conflictingClaim = &claim
	} else if !errors.Is(err, pgx.ErrNoRows) {
		slog.Error("get active pr claim by issue", "error", err)
		InternalError(w)
		return
	}

	if validationErr := validateSubmittedPR(*user, issue, *prStatus, prOwner, prRepo, conflictingClaim); validationErr != nil {
		BadRequest(w, validationErr.Code, validationErr.Message)
		return
	}

	updatedDraw, err := h.queries.SubmitPR(ctx, database.SubmitPRParams{
		ID:           draw.ID,
		PrUrl:        pgtype.Text{String: req.PRURL, Valid: true},
		PrOwnerLogin: pgtype.Text{String: prStatus.UserLogin, Valid: prStatus.UserLogin != ""},
		PrRepoOwner:  pgtype.Text{String: prOwner, Valid: prOwner != ""},
		PrRepoName:   pgtype.Text{String: prRepo, Valid: prRepo != ""},
		PrNumber:     pgtype.Int4{Int32: int32(prNumber), Valid: prNumber > 0},
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
		UserID:   user.ID,
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

	// Compute merge XP based on issue rarity and draw source.
	// Drawn issues get 3x, browsed/chosen issues get 1x.
	mergeXPMap := drawMergeXPByRarity
	if draw.Source == "choose" {
		mergeXPMap = browseMergeXPByRarity
	}
	mergeXP := mergeXPMap[issue.Rarity]
	if mergeXP == 0 {
		mergeXP = mergeXPMap["common"]
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
		RewardSource:   pgtype.Text{String: "manual_verify", Valid: true},
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

func validateSubmittedPR(user database.User, issue database.Issue, pr service.PRStatus, prOwner, prRepo string, conflictingClaim *database.Draw) *APIError {
	if !user.GithubUsername.Valid || !strings.EqualFold(user.GithubUsername.String, pr.UserLogin) {
		return &APIError{Code: ErrCodePRAuthorMismatch, Message: "PR author must match your linked GitHub account"}
	}

	if !strings.EqualFold(issue.RepoOwner, prOwner) || !strings.EqualFold(issue.RepoName, prRepo) {
		return &APIError{Code: ErrCodePRRepoMismatch, Message: "PR must target the same repository as the drawn issue"}
	}

	if !service.PRReferencesIssue(pr, issue.GithubNumber) {
		return &APIError{Code: ErrCodePRIssueReferenceMissing, Message: "PR title or body must reference the drawn issue number"}
	}

	if conflictingClaim != nil && conflictingClaim.UserID != user.ID {
		return &APIError{Code: ErrCodeIssueAlreadyClaimed, Message: "Another GitFable user already has an active PR claim for this issue"}
	}

	return nil
}

func mapPRVerificationError(err error) *APIError {
	msg := err.Error()
	switch {
	case strings.Contains(msg, "github API rate limited"):
		return &APIError{Code: ErrCodeRateLimited, Message: "GitHub API rate limited while verifying PR"}
	case strings.Contains(msg, "PR not found"):
		return &APIError{Code: ErrCodeInvalidPRURL, Message: "GitHub PR not found or not accessible"}
	default:
		return &APIError{Code: ErrCodeInvalidPRURL, Message: "Unable to verify GitHub PR"}
	}
}

// Reactivate handles POST /{id}/reactivate — reactivate an expired bookmark.
func (h *DrawHandler) Reactivate(w http.ResponseWriter, r *http.Request) {
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

	// Parse optional replace_draw_id from request body.
	var req struct {
		ReplaceDrawID string `json:"replace_draw_id,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		// Body is optional, ignore decode errors
		req.ReplaceDrawID = ""
	}

	// Get the expired draw with user check.
	draw, err := h.queries.GetDrawByPublicIDAndUser(ctx, database.GetDrawByPublicIDAndUserParams{
		PublicID: drawPublicID,
		UserID:   user.ID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			NotFound(w, "Draw not found")
			return
		}
		slog.Error("get draw for reactivation", "error", err)
		InternalError(w)
		return
	}

	// Only expired draws can be reactivated.
	if draw.Status != database.DrawStatusExpired {
		BadRequest(w, ErrCodeInvalidStatus, "Only expired bookmarks can be reactivated")
		return
	}

	// Check if user has room for another active bookmark.
	activeCount, err := h.queries.CountActiveWorkForUser(ctx, user.ID)
	if err != nil {
		slog.Error("count active work", "error", err)
		InternalError(w)
		return
	}

	// If bookmark limit reached and no replacement specified, return active work list.
	if activeBookmarkLimitReached(activeCount) && req.ReplaceDrawID == "" {
		activeWork, err := h.queries.ListActiveWorkForUser(ctx, user.ID)
		if err != nil {
			slog.Error("list active work for error response", "error", err)
			InternalError(w)
			return
		}

		writeJSON(w, http.StatusBadRequest, Response{
			Data: map[string]any{
				"active_work": drawActiveWorkRowsToResponse(activeWork),
				"limit":       maxActiveBookmarks,
			},
			Error: &APIError{
				Code:    ErrCodeBookmarkLimitReached,
				Message: fmt.Sprintf("Active bookmark limit reached (%d max). Choose one to replace.", maxActiveBookmarks),
			},
		})
		return
	}

	// Get the issue to verify it's still available.
	issue, err := h.queries.GetIssueByID(ctx, draw.IssueID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			BadRequest(w, ErrCodeBadRequest, "Issue no longer exists")
			return
		}
		slog.Error("get issue for reactivation", "error", err)
		InternalError(w)
		return
	}

	// Verify issue is still open.
	if issue.State != database.IssueStateOpen {
		BadRequest(w, ErrCodeBadRequest, "Issue is no longer open")
		return
	}

	// Check if issue is still available (no assignee, no open PRs).
	open, err := h.issueChecker.IsOpen(ctx, issue.RepoOwner, issue.RepoName, issue.GithubNumber)
	if err != nil {
		slog.Warn("reactivation freshness check failed, proceeding anyway", "error", err, "url", issue.Url)
	} else if !open {
		BadRequest(w, ErrCodeBadRequest, "Issue is no longer available (may have been claimed or closed)")
		return
	}

	// Start transaction for reactivation (with optional swap).
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		slog.Error("begin reactivation tx", "error", err)
		InternalError(w)
		return
	}
	defer tx.Rollback(ctx)

	qtx := h.queries.WithTx(tx)

	// If replacing a bookmark, expire it first.
	if req.ReplaceDrawID != "" {
		replacePublicID, err := parseUUID(req.ReplaceDrawID)
		if err != nil {
			BadRequest(w, ErrCodeBadRequest, "Invalid replace_draw_id format")
			return
		}

		replaceDraw, err := qtx.GetDrawByPublicIDAndUser(ctx, database.GetDrawByPublicIDAndUserParams{
			PublicID: replacePublicID,
			UserID:   user.ID,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				NotFound(w, "Replacement draw not found")
				return
			}
			slog.Error("get replacement draw", "error", err)
			InternalError(w)
			return
		}

		if !isSwappableActiveStatus(replaceDraw.Status) {
			BadRequest(w, ErrCodeInvalidStatus, "Replacement draw is not swappable")
			return
		}

		if _, err := qtx.UpdateDrawStatus(ctx, database.UpdateDrawStatusParams{
			ID:            replaceDraw.ID,
			Status:        database.DrawStatusExpired,
			CurrentStatus: replaceDraw.Status,
		}); err != nil {
			slog.Error("expire replacement draw", "error", err)
			InternalError(w)
			return
		}
	}

	// Reactivate the draw with new expiration date.
	_, expiresAt := chooseStatusAndExpiry(true, time.Now())
	reactivatedDraw, err := qtx.ReactivateExpiredDraw(ctx, database.ReactivateExpiredDrawParams{
		ID:        draw.ID,
		UserID:    user.ID,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			BadRequest(w, ErrCodeInvalidStatus, "Draw has already been reactivated or status changed")
			return
		}
		slog.Error("reactivate draw", "error", err)
		InternalError(w)
		return
	}

	if err := tx.Commit(ctx); err != nil {
		slog.Error("commit reactivation tx", "error", err)
		InternalError(w)
		return
	}

	OK(w, map[string]any{
		"draw": drawToResponse(reactivatedDraw),
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
		"rarity":     i.Rarity,
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

func drawActiveWorkRowToResponse(d database.ListActiveWorkForUserRow) map[string]any {
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

func drawActiveWorkRowsToResponse(draws []database.ListActiveWorkForUserRow) []map[string]any {
	items := make([]map[string]any, len(draws))
	for i, d := range draws {
		items[i] = drawActiveWorkRowToResponse(d)
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
