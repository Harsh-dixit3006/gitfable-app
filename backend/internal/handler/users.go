package handler

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nishantg96/gitfable/internal/ctxutil"
	"github.com/nishantg96/gitfable/internal/database"
)

type UsersHandler struct {
	Queries     *database.Queries
	RequireAuth func(http.Handler) http.Handler
}

func (h *UsersHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Group(func(r chi.Router) {
		r.Use(h.RequireAuth)
		r.Get("/dashboard", h.Dashboard)
		r.Put("/filters", h.UpdateFilters)
	})
	r.Get("/{username}", h.PublicProfile)
	return r
}

// Dashboard handles GET /dashboard — returns the authenticated user's dashboard data.
func (h *UsersHandler) Dashboard(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := ctxutil.UserFromContext(ctx)
	if user == nil {
		Unauthorized(w)
		return
	}

	// Fetch merged draws with issues (last 5).
	mergedDraws, err := h.Queries.GetUserMergedDrawsWithIssues(ctx, user.ID)
	if err != nil {
		slog.Error("get user merged draws", "error", err)
		InternalError(w)
		return
	}
	if len(mergedDraws) > 5 {
		mergedDraws = mergedDraws[:5]
	}

	// Fetch 365-day heatmap.
	startDate := time.Now().AddDate(0, 0, -365)
	heatmap, err := h.Queries.GetUserHeatmap(ctx, database.GetUserHeatmapParams{
		UserID:    user.ID,
		CreatedAt: pgtype.Timestamptz{Time: startDate, Valid: true},
	})
	if err != nil {
		slog.Error("get user heatmap", "error", err)
		InternalError(w)
		return
	}

	// Fetch badges.
	badges, err := h.Queries.GetUserBadges(ctx, user.ID)
	if err != nil {
		slog.Error("get user badges", "error", err)
		InternalError(w)
		return
	}

	OK(w, map[string]any{
		"user":          userToResponse(*user),
		"recent_draws":  mergedDrawsToResponse(mergedDraws),
		"heatmap":       heatmapToResponse(heatmap),
		"badges":        badgesToResponse(badges),
	})
}

// PublicProfile handles GET /{username} — public profile by username.
func (h *UsersHandler) PublicProfile(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	username := chi.URLParam(r, "username")
	if username == "" {
		BadRequest(w, ErrCodeBadRequest, "Username is required")
		return
	}

	user, err := h.Queries.GetUserByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			NotFound(w, "User not found")
			return
		}
		slog.Error("get user by username", "error", err)
		InternalError(w)
		return
	}

	// Fetch recent 10 merged draws.
	mergedDraws, err := h.Queries.GetUserMergedDrawsWithIssues(ctx, user.ID)
	if err != nil {
		slog.Error("get user merged draws", "error", err)
		InternalError(w)
		return
	}
	if len(mergedDraws) > 10 {
		mergedDraws = mergedDraws[:10]
	}

	// Fetch badges.
	badges, err := h.Queries.GetUserBadges(ctx, user.ID)
	if err != nil {
		slog.Error("get user badges", "error", err)
		InternalError(w)
		return
	}

	OK(w, map[string]any{
		"user":         publicUserToResponse(user),
		"recent_draws": mergedDrawsToResponse(mergedDraws),
		"badges":       badgesToResponse(badges),
	})
}

// UpdateFilters handles PUT /filters — update user filters (JSONB).
func (h *UsersHandler) UpdateFilters(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	user := ctxutil.UserFromContext(ctx)
	if user == nil {
		Unauthorized(w)
		return
	}

	var req struct {
		Languages    []string `json:"languages"`
		Difficulties []string `json:"difficulties"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid request body")
		return
	}

	filtersJSON, err := json.Marshal(req)
	if err != nil {
		slog.Error("marshal filters", "error", err)
		InternalError(w)
		return
	}

	updated, err := h.Queries.UpdateUserFilters(ctx, database.UpdateUserFiltersParams{
		ID:      user.ID,
		Filters: filtersJSON,
	})
	if err != nil {
		slog.Error("update user filters", "error", err)
		InternalError(w)
		return
	}

	OK(w, userToResponse(updated))
}

// --- Response helpers ---

func publicUserToResponse(u database.User) map[string]any {
	return map[string]any{
		"id":                  uuidToString(u.PublicID),
		"username":            u.Username,
		"display_name":        u.DisplayName,
		"avatar_url":          u.AvatarUrl,
		"xp":                  u.Xp,
		"level":               u.Level,
		"current_streak":      u.CurrentStreak,
		"longest_streak":      u.LongestStreak,
		"total_contributions": u.TotalContributions,
		"created_at":          pgTimestamptzToString(u.CreatedAt),
	}
}

func mergedDrawsToResponse(draws []database.GetUserMergedDrawsWithIssuesRow) []map[string]any {
	items := make([]map[string]any, len(draws))
	for i, d := range draws {
		item := map[string]any{
			"id":         uuidToString(d.PublicID),
			"xp_awarded": d.XpAwarded,
			"created_at": pgTimestamptzToString(d.CreatedAt),
			"merged_at":  pgTimestamptzToString(d.MergedAt),
			"repo_owner": d.RepoOwner,
			"repo_name":  d.RepoName,
			"labels":     d.Labels,
		}
		if d.Language.Valid {
			item["language"] = d.Language.String
		}
		if d.Difficulty.Valid {
			item["difficulty"] = d.Difficulty.String
		}
		items[i] = item
	}
	return items
}

func heatmapToResponse(rows []database.GetUserHeatmapRow) []map[string]any {
	items := make([]map[string]any, len(rows))
	for i, r := range rows {
		day := ""
		if r.Day.Valid {
			day = r.Day.Time.Format("2006-01-02")
		}
		items[i] = map[string]any{
			"day":   day,
			"count": r.Count,
		}
	}
	return items
}

func badgesToResponse(rows []database.GetUserBadgesRow) []map[string]any {
	items := make([]map[string]any, len(rows))
	for i, b := range rows {
		items[i] = map[string]any{
			"name":        b.Name,
			"description": b.Description,
			"icon":        b.Icon,
			"earned_at":   pgTimestamptzToString(b.EarnedAt),
		}
	}
	return items
}
