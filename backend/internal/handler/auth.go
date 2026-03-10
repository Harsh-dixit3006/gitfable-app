package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/supabase"
)

var usernameRegex = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`)
var consecutiveHyphens = regexp.MustCompile(`--`)

type supabaseAuthClient interface {
	VerifyToken(ctx context.Context, jwt string) (*supabase.TokenInfo, error)
	GetUser(ctx context.Context, uid string) (*supabase.UserInfo, error)
}

type AuthHandler struct {
	Queries               *database.Queries
	SB                    supabaseAuthClient
	RequireAuth           func(http.Handler) http.Handler
	UserFromContext       func(context.Context) *database.User
	DefaultDailyDrawLimit int
}

func (h *AuthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/register", h.Register)
	r.Group(func(r chi.Router) {
		r.Use(h.RequireAuth)
		r.Get("/me", h.Me)
		r.Put("/me", h.UpdateMe)
	})
	return r
}

type registerRequest struct {
	Username string `json:"username"`
}

type updateMeRequest struct {
	DisplayName *string `json:"display_name"`
	AvatarURL   *string `json:"avatar_url"`
}

type userResponse struct {
	ID                   string  `json:"id"`
	Username             string  `json:"username"`
	Email                string  `json:"email"`
	DisplayName          string  `json:"display_name"`
	AvatarURL            string  `json:"avatar_url"`
	GithubUsername       *string `json:"github_username"`
	XP                   int32   `json:"xp"`
	Level                int32   `json:"level"`
	CurrentStreak        int32   `json:"current_streak"`
	LongestStreak        int32   `json:"longest_streak"`
	TotalContributions   int32   `json:"total_contributions"`
	DailyDrawLimit       int32   `json:"daily_draw_limit"`
	LastContributionDate *string `json:"last_contribution_date"`
	CreatedAt            string  `json:"created_at"`
	UpdatedAt            string  `json:"updated_at"`
}

func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return fmt.Sprintf("%x-%x-%x-%x-%x", u.Bytes[0:4], u.Bytes[4:6], u.Bytes[6:8], u.Bytes[8:10], u.Bytes[10:16])
}

func pgTextToPtr(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	return &t.String
}

func pgTimestamptzToString(t pgtype.Timestamptz) string {
	if !t.Valid {
		return ""
	}
	return t.Time.Format(time.RFC3339)
}

func pgTimestamptzToPtr(t pgtype.Timestamptz) *string {
	if !t.Valid {
		return nil
	}
	s := t.Time.Format(time.RFC3339)
	return &s
}

func userToResponse(u database.User, defaultDailyDrawLimit int) userResponse {
	return userResponse{
		ID:                   uuidToString(u.PublicID),
		Username:             u.Username,
		Email:                u.Email,
		DisplayName:          u.DisplayName,
		AvatarURL:            u.AvatarUrl,
		GithubUsername:       pgTextToPtr(u.GithubUsername),
		XP:                   u.Xp,
		Level:                u.Level,
		CurrentStreak:        u.CurrentStreak,
		LongestStreak:        u.LongestStreak,
		TotalContributions:   u.TotalContributions,
		DailyDrawLimit:       int32(effectiveDailyDrawLimit(u, defaultDailyDrawLimit)),
		LastContributionDate: pgTimestamptzToPtr(u.LastContributionDate),
		CreatedAt:            pgTimestamptzToString(u.CreatedAt),
		UpdatedAt:            pgTimestamptzToString(u.UpdatedAt),
	}
}

func validateUsername(username string) (string, string) {
	username = strings.ToLower(username)

	if len(username) < 2 || len(username) > 39 {
		return "", "Username must be between 2 and 39 characters"
	}

	if !usernameRegex.MatchString(username) {
		return "", "Username must contain only lowercase alphanumeric characters or hyphens, and cannot start or end with a hyphen"
	}

	if consecutiveHyphens.MatchString(username) {
		return "", "Username must not contain consecutive hyphens"
	}

	return username, ""
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid request body")
		return
	}

	username, errMsg := validateUsername(req.Username)
	if errMsg != "" {
		BadRequest(w, ErrCodeBadRequest, errMsg)
		return
	}

	// Extract token from Authorization header
	bearerToken := r.Header.Get("Authorization")
	if !strings.HasPrefix(bearerToken, "Bearer ") {
		Unauthorized(w)
		return
	}
	bearerToken = strings.TrimPrefix(bearerToken, "Bearer ")

	ctx := r.Context()

	// Verify Supabase token
	tokenInfo, err := h.SB.VerifyToken(ctx, bearerToken)
	if err != nil {
		Unauthorized(w)
		return
	}

	// Check if user already exists
	_, err = h.Queries.GetUserByAuthID(ctx, tokenInfo.UID)
	if err == nil {
		BadRequest(w, ErrCodeConflict, "User already registered")
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		InternalError(w)
		return
	}

	// Check username uniqueness
	_, err = h.Queries.GetUserByUsername(ctx, username)
	if err == nil {
		BadRequest(w, ErrCodeUsernameTaken, "Username is already taken")
		return
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		InternalError(w)
		return
	}

	// Get GitHub provider info from Supabase
	sbUser, err := h.SB.GetUser(ctx, tokenInfo.UID)
	if err != nil {
		InternalError(w)
		return
	}

	var githubID pgtype.Text
	var githubUsername pgtype.Text
	if sbUser.ProviderID == "github" {
		githubID = pgtype.Text{String: sbUser.GithubID, Valid: true}
		githubUsername = pgtype.Text{String: username, Valid: true}
	}

	displayName := sbUser.DisplayName
	if displayName == "" {
		displayName = username
	}

	avatarURL := sbUser.PhotoURL

	user, err := h.Queries.CreateUserWithAuthID(ctx, database.CreateUserWithAuthIDParams{
		AuthID:         tokenInfo.UID,
		Username:       username,
		Email:          tokenInfo.Email,
		DisplayName:    displayName,
		AvatarUrl:      avatarURL,
		GithubID:       githubID,
		GithubUsername: githubUsername,
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			if strings.Contains(pgErr.ConstraintName, "email") {
				BadRequest(w, ErrCodeEmailTaken, "Email is already registered")
				return
			}
			BadRequest(w, ErrCodeConflict, "User already exists")
			return
		}
		InternalError(w)
		return
	}

	Created(w, userToResponse(user, h.DefaultDailyDrawLimit))
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user := h.UserFromContext(r.Context())
	if user == nil {
		Unauthorized(w)
		return
	}

	OK(w, userToResponse(*user, h.DefaultDailyDrawLimit))
}

func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	user := h.UserFromContext(r.Context())
	if user == nil {
		Unauthorized(w)
		return
	}

	var req updateMeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid request body")
		return
	}

	displayName := user.DisplayName
	if req.DisplayName != nil {
		displayName = *req.DisplayName
	}

	avatarURL := user.AvatarUrl
	if req.AvatarURL != nil {
		avatarURL = *req.AvatarURL
	}

	updated, err := h.Queries.UpdateUserProfile(r.Context(), database.UpdateUserProfileParams{
		ID:          user.ID,
		DisplayName: displayName,
		AvatarUrl:   avatarURL,
	})
	if err != nil {
		InternalError(w)
		return
	}

	OK(w, userToResponse(updated, h.DefaultDailyDrawLimit))
}
