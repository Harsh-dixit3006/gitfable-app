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
	"github.com/nishantg96/gitfable/internal/auth"
	"github.com/nishantg96/gitfable/internal/database"
)

var usernameRegex = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$`)
var consecutiveHyphens = regexp.MustCompile(`--`)

type AuthHandler struct {
	Queries               *database.Queries
	JWT                   *auth.JWTManager
	RequireAuth           func(http.Handler) http.Handler
	UserFromContext        func(context.Context) *database.User
	DefaultDailyDrawLimit int
	DevLoginEnabled       bool
}

func (h *AuthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/register", h.Register)
	if h.DevLoginEnabled {
		r.Post("/dev-login", h.DevLogin)
	}
	r.Group(func(r chi.Router) {
		r.Use(h.RequireAuth)
		r.Get("/me", h.Me)
		r.Put("/me", h.UpdateMe)
	})
	return r
}

type registerRequest struct {
	Username    string `json:"username"`
	GithubLogin string `json:"github_login"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
}

type registerResponse struct {
	User         userResponse `json:"user"`
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
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

// Register creates a new user from a registration token (issued during OAuth callback).
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

	// Extract registration token from Authorization header
	bearerToken := r.Header.Get("Authorization")
	if !strings.HasPrefix(bearerToken, "Bearer ") {
		Unauthorized(w)
		return
	}
	bearerToken = strings.TrimPrefix(bearerToken, "Bearer ")

	// Verify registration token
	claims, err := h.JWT.Verify(bearerToken)
	if err != nil {
		Unauthorized(w)
		return
	}
	if claims.TokenType != auth.TokenTypeRegistration {
		BadRequest(w, ErrCodeBadRequest, "Invalid token type for registration")
		return
	}

	ctx := r.Context()
	githubID := claims.Sub

	// Check if user already exists
	_, err = h.Queries.GetUserByAuthID(ctx, githubID)
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

	displayName := req.DisplayName
	if displayName == "" {
		displayName = username
	}

	githubLogin := req.GithubLogin
	if githubLogin == "" {
		githubLogin = username
	}

	user, err := h.Queries.CreateUserWithAuthID(ctx, database.CreateUserWithAuthIDParams{
		AuthID:         githubID,
		Username:       username,
		Email:          claims.Email,
		DisplayName:    displayName,
		AvatarUrl:      req.AvatarURL,
		GithubID:       pgtype.Text{String: githubID, Valid: true},
		GithubUsername: pgtype.Text{String: githubLogin, Valid: true},
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

	// Issue real tokens for the newly registered user
	accessToken, err := h.JWT.SignAccessToken(githubID, user.Email)
	if err != nil {
		InternalError(w)
		return
	}
	refreshToken, err := h.JWT.SignRefreshToken(githubID)
	if err != nil {
		InternalError(w)
		return
	}

	Created(w, registerResponse{
		User:         userToResponse(user, h.DefaultDailyDrawLimit),
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
	})
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

// DevLogin creates or finds a dev user and returns tokens. Only available in dev mode without OAuth.
func (h *AuthHandler) DevLogin(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	const devAuthID = "dev-user-1"
	const devEmail = "dev@localhost"

	user, err := h.Queries.GetUserByAuthID(ctx, devAuthID)
	if err != nil {
		// Create dev user
		user, err = h.Queries.CreateUserWithAuthID(ctx, database.CreateUserWithAuthIDParams{
			AuthID:      devAuthID,
			Username:    "dev",
			Email:       devEmail,
			DisplayName: "Dev User",
			AvatarUrl:   "",
		})
		if err != nil {
			InternalError(w)
			return
		}
	}

	accessToken, err := h.JWT.SignAccessToken(devAuthID, user.Email)
	if err != nil {
		InternalError(w)
		return
	}
	refreshToken, err := h.JWT.SignRefreshToken(devAuthID)
	if err != nil {
		InternalError(w)
		return
	}

	OK(w, map[string]any{
		"user":          userToResponse(user, h.DefaultDailyDrawLimit),
		"access_token":  accessToken,
		"refresh_token": refreshToken,
	})
}
