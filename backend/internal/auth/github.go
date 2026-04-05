package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	githubAuthorizeURL = "https://github.com/login/oauth/authorize"
	githubTokenURL     = "https://github.com/login/oauth/access_token"
	githubUserURL      = "https://api.github.com/user"
	githubEmailsURL    = "https://api.github.com/user/emails"
)

type GitHubUser struct {
	ID        int64  `json:"id"`
	Login     string `json:"login"`
	Email     string `json:"email"`
	Name      string `json:"name"`
	AvatarURL string `json:"avatar_url"`
}

// IDString returns the GitHub user ID as a string for use as auth_id.
func (u *GitHubUser) IDString() string {
	return strconv.FormatInt(u.ID, 10)
}

type githubEmail struct {
	Email    string `json:"email"`
	Primary  bool   `json:"primary"`
	Verified bool   `json:"verified"`
}

type GitHubOAuth struct {
	clientID     string
	clientSecret string
	callbackURL  string
	httpClient   *http.Client
}

func NewGitHubOAuth(clientID, clientSecret, callbackURL string) *GitHubOAuth {
	return &GitHubOAuth{
		clientID:     clientID,
		clientSecret: clientSecret,
		callbackURL:  callbackURL,
		httpClient:   &http.Client{Timeout: 10 * time.Second},
	}
}

// AuthorizationURL returns the GitHub OAuth authorize URL with the given state.
func (g *GitHubOAuth) AuthorizationURL(state string) string {
	params := url.Values{
		"client_id":    {g.clientID},
		"redirect_uri": {g.callbackURL},
		"scope":        {"read:user user:email"},
		"state":        {state},
	}
	return githubAuthorizeURL + "?" + params.Encode()
}

// ExchangeCode exchanges an authorization code for a GitHub access token.
func (g *GitHubOAuth) ExchangeCode(ctx context.Context, code string) (string, error) {
	data := url.Values{
		"client_id":     {g.clientID},
		"client_secret": {g.clientSecret},
		"code":          {code},
		"redirect_uri":  {g.callbackURL},
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, githubTokenURL, strings.NewReader(data.Encode()))
	if err != nil {
		return "", fmt.Errorf("build token request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("exchange code: %w", err)
	}
	defer resp.Body.Close()

	var result struct {
		AccessToken string `json:"access_token"`
		Error       string `json:"error"`
		ErrorDesc   string `json:"error_description"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode token response: %w", err)
	}
	if result.Error != "" {
		return "", fmt.Errorf("github oauth error: %s: %s", result.Error, result.ErrorDesc)
	}
	if result.AccessToken == "" {
		return "", fmt.Errorf("empty access token from github")
	}

	return result.AccessToken, nil
}

// GetUser fetches the authenticated GitHub user's profile.
// If the user's profile email is empty, it fetches from the emails API.
func (g *GitHubOAuth) GetUser(ctx context.Context, accessToken string) (*GitHubUser, error) {
	user, err := g.fetchUser(ctx, accessToken)
	if err != nil {
		return nil, err
	}

	if user.Email == "" {
		email, err := g.fetchPrimaryEmail(ctx, accessToken)
		if err == nil && email != "" {
			user.Email = email
		}
	}

	return user, nil
}

func (g *GitHubOAuth) fetchUser(ctx context.Context, accessToken string) (*GitHubUser, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubUserURL, nil)
	if err != nil {
		return nil, fmt.Errorf("build user request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch user: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("fetch user: status %d", resp.StatusCode)
	}

	var user GitHubUser
	if err := json.NewDecoder(resp.Body).Decode(&user); err != nil {
		return nil, fmt.Errorf("decode user: %w", err)
	}

	return &user, nil
}

func (g *GitHubOAuth) fetchPrimaryEmail(ctx context.Context, accessToken string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, githubEmailsURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("fetch emails: status %d", resp.StatusCode)
	}

	var emails []githubEmail
	if err := json.NewDecoder(resp.Body).Decode(&emails); err != nil {
		return "", err
	}

	for _, e := range emails {
		if e.Primary && e.Verified {
			return e.Email, nil
		}
	}
	for _, e := range emails {
		if e.Verified {
			return e.Email, nil
		}
	}

	return "", nil
}
