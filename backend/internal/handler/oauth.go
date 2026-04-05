package handler

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nishantg96/gitfable/internal/auth"
	"github.com/nishantg96/gitfable/internal/database"
)

const (
	oauthStateCookieName = "oauth_state"
	oauthStateCookieTTL  = 5 * time.Minute
)

type OAuthHandler struct {
	JWT         *auth.JWTManager
	GitHub      *auth.GitHubOAuth
	Queries     *database.Queries
	FrontendURL string
}

func (h *OAuthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/github", h.InitiateGitHub)
	r.Get("/github/callback", h.GitHubCallback)
	r.Post("/refresh", h.RefreshToken)
	return r
}

// InitiateGitHub redirects the user to GitHub's OAuth authorization page.
func (h *OAuthHandler) InitiateGitHub(w http.ResponseWriter, r *http.Request) {
	state, err := generateState()
	if err != nil {
		slog.Error("failed to generate oauth state", "error", err)
		InternalError(w)
		return
	}

	secure := strings.HasPrefix(h.FrontendURL, "https://")
	http.SetCookie(w, &http.Cookie{
		Name:     oauthStateCookieName,
		Value:    state,
		Path:     "/api/v1/oauth",
		MaxAge:   int(oauthStateCookieTTL.Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})

	http.Redirect(w, r, h.GitHub.AuthorizationURL(state), http.StatusTemporaryRedirect)
}

// GitHubCallback handles the OAuth callback from GitHub.
func (h *OAuthHandler) GitHubCallback(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	// Validate state
	stateCookie, err := r.Cookie(oauthStateCookieName)
	if err != nil || stateCookie.Value == "" {
		h.redirectWithError(w, r, "invalid_state", "Missing OAuth state")
		return
	}
	if r.URL.Query().Get("state") != stateCookie.Value {
		h.redirectWithError(w, r, "invalid_state", "OAuth state mismatch")
		return
	}

	// Clear state cookie
	http.SetCookie(w, &http.Cookie{
		Name:   oauthStateCookieName,
		Path:   "/api/v1/oauth",
		MaxAge: -1,
	})

	// Check for error from GitHub
	if errCode := r.URL.Query().Get("error"); errCode != "" {
		h.redirectWithError(w, r, errCode, r.URL.Query().Get("error_description"))
		return
	}

	// Exchange code for GitHub access token
	code := r.URL.Query().Get("code")
	if code == "" {
		h.redirectWithError(w, r, "missing_code", "No authorization code")
		return
	}

	githubToken, err := h.GitHub.ExchangeCode(ctx, code)
	if err != nil {
		slog.Error("failed to exchange github code", "error", err)
		h.redirectWithError(w, r, "exchange_failed", "Failed to authenticate with GitHub")
		return
	}

	// Fetch GitHub user info
	ghUser, err := h.GitHub.GetUser(ctx, githubToken)
	if err != nil {
		slog.Error("failed to fetch github user", "error", err)
		h.redirectWithError(w, r, "user_fetch_failed", "Failed to get user info from GitHub")
		return
	}

	githubID := ghUser.IDString()

	// Check if user exists
	user, err := h.Queries.GetUserByAuthID(ctx, githubID)
	if err == nil {
		// Existing user — issue tokens
		accessToken, err := h.JWT.SignAccessToken(githubID, user.Email)
		if err != nil {
			slog.Error("failed to sign access token", "error", err)
			h.redirectWithError(w, r, "token_error", "Failed to create session")
			return
		}
		refreshToken, err := h.JWT.SignRefreshToken(githubID)
		if err != nil {
			slog.Error("failed to sign refresh token", "error", err)
			h.redirectWithError(w, r, "token_error", "Failed to create session")
			return
		}

		h.redirectWithTokens(w, r, accessToken, refreshToken)
		return
	}

	// New user — issue registration token
	regToken, err := h.JWT.SignRegistrationToken(githubID, ghUser.Email)
	if err != nil {
		slog.Error("failed to sign registration token", "error", err)
		h.redirectWithError(w, r, "token_error", "Failed to create session")
		return
	}

	params := url.Values{
		"needs_registration": {"true"},
		"token":              {regToken},
		"github_login":       {ghUser.Login},
		"github_name":        {ghUser.Name},
		"github_avatar":      {ghUser.AvatarURL},
	}
	http.Redirect(w, r, h.FrontendURL+"/auth/callback?"+params.Encode(), http.StatusTemporaryRedirect)
}

// RefreshToken issues a new access+refresh token pair from a valid refresh token.
func (h *OAuthHandler) RefreshToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RefreshToken string `json:"refresh_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.RefreshToken == "" {
		BadRequest(w, ErrCodeBadRequest, "refresh_token is required")
		return
	}

	claims, err := h.JWT.Verify(req.RefreshToken)
	if err != nil {
		Unauthorized(w)
		return
	}
	if claims.TokenType != auth.TokenTypeRefresh {
		BadRequest(w, ErrCodeBadRequest, "Invalid token type")
		return
	}

	// Verify user still exists and is active
	user, err := h.Queries.GetUserByAuthID(r.Context(), claims.Sub)
	if err != nil {
		Unauthorized(w)
		return
	}
	if user.Status != database.UserStatusActive {
		Forbidden(w, "Account is disabled")
		return
	}

	accessToken, err := h.JWT.SignAccessToken(claims.Sub, user.Email)
	if err != nil {
		InternalError(w)
		return
	}
	refreshToken, err := h.JWT.SignRefreshToken(claims.Sub)
	if err != nil {
		InternalError(w)
		return
	}

	OK(w, map[string]string{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
	})
}

func (h *OAuthHandler) redirectWithTokens(w http.ResponseWriter, r *http.Request, access, refresh string) {
	params := url.Values{
		"token":   {access},
		"refresh": {refresh},
	}
	http.Redirect(w, r, h.FrontendURL+"/auth/callback?"+params.Encode(), http.StatusTemporaryRedirect)
}

func (h *OAuthHandler) redirectWithError(w http.ResponseWriter, r *http.Request, code, message string) {
	params := url.Values{
		"error":             {code},
		"error_description": {message},
	}
	http.Redirect(w, r, h.FrontendURL+"/auth/callback?"+params.Encode(), http.StatusTemporaryRedirect)
}

func generateState() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}
