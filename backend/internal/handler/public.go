package handler

import (
	"encoding/base64"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nishantg96/gitfable/internal/database"
)

type PublicHandler struct {
	Queries *database.Queries
}

func (h *PublicHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/issues", h.ListIssues)
	r.Get("/leaderboard", h.Leaderboard)
	r.Get("/stats", h.Stats)
	r.Get("/activity", h.Activity)
	return r
}

// ListIssues handles GET /issues — cursor-paginated, with optional language/difficulty filters.
func (h *PublicHandler) ListIssues(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	limit := parseLimit(r.URL.Query().Get("limit"))
	cursor := r.URL.Query().Get("cursor")
	language := r.URL.Query().Get("language")
	difficulty := r.URL.Query().Get("difficulty")
	rarity := r.URL.Query().Get("rarity")

	langParam := pgtype.Text{}
	if language != "" {
		langParam = pgtype.Text{String: language, Valid: true}
	}
	diffParam := pgtype.Text{}
	if difficulty != "" {
		diffParam = pgtype.Text{String: difficulty, Valid: true}
	}
	rarityParam := pgtype.Text{}
	if rarity != "" {
		rarityParam = pgtype.Text{String: rarity, Valid: true}
	}

	if cursor != "" {
		cursorStars, cursorID, err := decodeIntCursor(cursor)
		if err != nil {
			BadRequest(w, ErrCodeBadRequest, "Invalid cursor")
			return
		}

		issues, err := h.Queries.ListIssuesAfterCursor(ctx, database.ListIssuesAfterCursorParams{
			RepoStars:  int32(cursorStars),
			CursorID:   cursorID,
			Limit:      int32(limit),
			Language:   langParam,
			Difficulty: diffParam,
			Rarity:     rarityParam,
		})
		if err != nil {
			slog.Error("list issues after cursor", "error", err)
			InternalError(w)
			return
		}

		items := issuesToResponse(issues)
		nextCursor := ""
		hasMore := len(issues) == limit
		if hasMore && len(issues) > 0 {
			last := issues[len(issues)-1]
			nextCursor = encodeIntCursor(int64(last.RepoStars), last.ID)
		}
		OKList(w, items, nextCursor, hasMore)
		return
	}

	// First page.
	issues, err := h.Queries.ListIssues(ctx, database.ListIssuesParams{
		Limit:      int32(limit),
		Language:   langParam,
		Difficulty: diffParam,
		Rarity:     rarityParam,
	})
	if err != nil {
		slog.Error("list issues", "error", err)
		InternalError(w)
		return
	}

	items := issuesToResponse(issues)
	nextCursor := ""
	hasMore := len(issues) == limit
	if hasMore && len(issues) > 0 {
		last := issues[len(issues)-1]
		nextCursor = encodeIntCursor(int64(last.RepoStars), last.ID)
	}
	OKList(w, items, nextCursor, hasMore)
}

// Leaderboard handles GET /leaderboard — cursor-paginated, sorted by XP DESC.
func (h *PublicHandler) Leaderboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	limit := parseLimit(r.URL.Query().Get("limit"))
	cursor := r.URL.Query().Get("cursor")

	if cursor != "" {
		cursorXP, cursorID, err := decodeIntCursor(cursor)
		if err != nil {
			BadRequest(w, ErrCodeBadRequest, "Invalid cursor")
			return
		}

		rows, err := h.Queries.GetLeaderboardAfterCursor(ctx, database.GetLeaderboardAfterCursorParams{
			Xp:       int32(cursorXP),
			CursorID: cursorID,
			Limit:    int32(limit),
		})
		if err != nil {
			slog.Error("get leaderboard after cursor", "error", err)
			InternalError(w)
			return
		}

		items := leaderboardAfterCursorToResponse(rows)
		nextCursor := ""
		hasMore := len(rows) == limit
		if hasMore && len(rows) > 0 {
			last := rows[len(rows)-1]
			nextCursor = encodeIntCursor(int64(last.Xp), last.ID)
		}
		OKList(w, items, nextCursor, hasMore)
		return
	}

	// First page.
	rows, err := h.Queries.GetLeaderboard(ctx, int32(limit))
	if err != nil {
		slog.Error("get leaderboard", "error", err)
		InternalError(w)
		return
	}

	items := leaderboardToResponse(rows)
	nextCursor := ""
	hasMore := len(rows) == limit
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		nextCursor = encodeIntCursor(int64(last.Xp), last.ID)
	}
	OKList(w, items, nextCursor, hasMore)
}

// Stats handles GET /stats — returns merged draw count, active user count, distinct repo count.
func (h *PublicHandler) Stats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	mergedCount, err := h.Queries.CountMergedDraws(ctx)
	if err != nil {
		slog.Error("count merged draws", "error", err)
		InternalError(w)
		return
	}

	activeUsers, err := h.Queries.CountActiveUsers(ctx)
	if err != nil {
		slog.Error("count active users", "error", err)
		InternalError(w)
		return
	}

	repoCount, err := h.Queries.CountDistinctRepos(ctx)
	if err != nil {
		slog.Error("count distinct repos", "error", err)
		InternalError(w)
		return
	}

	OK(w, map[string]any{
		"merged_draws":  mergedCount,
		"active_users":  activeUsers,
		"distinct_repos": repoCount,
	})
}

// Activity handles GET /activity — cursor-paginated recent activity feed.
func (h *PublicHandler) Activity(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	limit := parseLimit(r.URL.Query().Get("limit"))
	cursor := r.URL.Query().Get("cursor")

	if cursor != "" {
		cursorTime, cursorID, err := decodeCursor(cursor)
		if err != nil {
			BadRequest(w, ErrCodeBadRequest, "Invalid cursor")
			return
		}

		rows, err := h.Queries.ListRecentActivitiesAfterCursor(ctx, database.ListRecentActivitiesAfterCursorParams{
			CreatedAt: pgtype.Timestamptz{Time: cursorTime, Valid: true},
			CursorID:  cursorID,
			Limit:     int32(limit),
		})
		if err != nil {
			slog.Error("list activities after cursor", "error", err)
			InternalError(w)
			return
		}

		items := activitiesAfterCursorToResponse(rows)
		nextCursor := ""
		hasMore := len(rows) == limit
		if hasMore && len(rows) > 0 {
			last := rows[len(rows)-1]
			nextCursor = encodeCursor(last.CreatedAt, last.ID)
		}
		OKList(w, items, nextCursor, hasMore)
		return
	}

	// First page.
	rows, err := h.Queries.ListRecentActivities(ctx, int32(limit))
	if err != nil {
		slog.Error("list recent activities", "error", err)
		InternalError(w)
		return
	}

	items := activitiesToResponse(rows)
	nextCursor := ""
	hasMore := len(rows) == limit
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		nextCursor = encodeCursor(last.CreatedAt, last.ID)
	}
	OKList(w, items, nextCursor, hasMore)
}

// --- Response helpers ---

func issuesToResponse(issues []database.Issue) []map[string]any {
	items := make([]map[string]any, len(issues))
	for i, issue := range issues {
		items[i] = issueToResponse(issue)
	}
	return items
}

func leaderboardRowToResponse(row database.GetLeaderboardRow) map[string]any {
	return map[string]any{
		"id":                  uuidToString(row.PublicID),
		"username":            row.Username,
		"display_name":        row.DisplayName,
		"avatar_url":          row.AvatarUrl,
		"xp":                  row.Xp,
		"level":               row.Level,
		"total_contributions": row.TotalContributions,
	}
}

func leaderboardToResponse(rows []database.GetLeaderboardRow) []map[string]any {
	items := make([]map[string]any, len(rows))
	for i, r := range rows {
		items[i] = leaderboardRowToResponse(r)
	}
	return items
}

func leaderboardAfterCursorRowToResponse(row database.GetLeaderboardAfterCursorRow) map[string]any {
	return map[string]any{
		"id":                  uuidToString(row.PublicID),
		"username":            row.Username,
		"display_name":        row.DisplayName,
		"avatar_url":          row.AvatarUrl,
		"xp":                  row.Xp,
		"level":               row.Level,
		"total_contributions": row.TotalContributions,
	}
}

func leaderboardAfterCursorToResponse(rows []database.GetLeaderboardAfterCursorRow) []map[string]any {
	items := make([]map[string]any, len(rows))
	for i, r := range rows {
		items[i] = leaderboardAfterCursorRowToResponse(r)
	}
	return items
}

func activityRowToResponse(row database.ListRecentActivitiesRow) map[string]any {
	resp := map[string]any{
		"id":             row.ID,
		"action":         string(row.Action),
		"created_at":     pgTimestamptzToString(row.CreatedAt),
		"username":       row.Username,
		"avatar_url":     row.AvatarUrl,
		"user_public_id": uuidToString(row.UserPublicID),
	}
	if row.RepoOwner.Valid {
		resp["repo_owner"] = row.RepoOwner.String
	}
	if row.RepoName.Valid {
		resp["repo_name"] = row.RepoName.String
	}
	if row.Title.Valid {
		resp["title"] = row.Title.String
	}
	return resp
}

func activitiesToResponse(rows []database.ListRecentActivitiesRow) []map[string]any {
	items := make([]map[string]any, len(rows))
	for i, r := range rows {
		items[i] = activityRowToResponse(r)
	}
	return items
}

func activityAfterCursorRowToResponse(row database.ListRecentActivitiesAfterCursorRow) map[string]any {
	resp := map[string]any{
		"id":             row.ID,
		"action":         string(row.Action),
		"created_at":     pgTimestamptzToString(row.CreatedAt),
		"username":       row.Username,
		"avatar_url":     row.AvatarUrl,
		"user_public_id": uuidToString(row.UserPublicID),
	}
	if row.RepoOwner.Valid {
		resp["repo_owner"] = row.RepoOwner.String
	}
	if row.RepoName.Valid {
		resp["repo_name"] = row.RepoName.String
	}
	if row.Title.Valid {
		resp["title"] = row.Title.String
	}
	return resp
}

func activitiesAfterCursorToResponse(rows []database.ListRecentActivitiesAfterCursorRow) []map[string]any {
	items := make([]map[string]any, len(rows))
	for i, r := range rows {
		items[i] = activityAfterCursorRowToResponse(r)
	}
	return items
}

// encodeIntCursor encodes a (value, id) pair for integer-based cursor pagination.
func encodeIntCursor(value, id int64) string {
	raw := fmt.Sprintf("%d,%d", value, id)
	return base64.StdEncoding.EncodeToString([]byte(raw))
}

// decodeIntCursor decodes an integer-based cursor into (value, id).
func decodeIntCursor(cursor string) (int64, int64, error) {
	raw, err := base64.StdEncoding.DecodeString(cursor)
	if err != nil {
		return 0, 0, err
	}

	parts := strings.SplitN(string(raw), ",", 2)
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid cursor format")
	}

	value, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		return 0, 0, err
	}

	id, err := strconv.ParseInt(parts[1], 10, 64)
	if err != nil {
		return 0, 0, err
	}

	return value, id, nil
}
