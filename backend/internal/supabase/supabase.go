package supabase

import (
	"context"
	"fmt"
	"os"

	sb "github.com/supabase-community/supabase-go"
)

type Client struct {
	client *sb.Client
}

type Config struct {
	ProjectURL string
	APIKey     string
}

func NewClient(config Config) (*Client, error) {
	client, err := sb.NewClient(config.ProjectURL, config.APIKey, nil)
	if err != nil {
		return nil, fmt.Errorf("init supabase client: %w", err)
	}

	return &Client{client: client}, nil
}

func NewClientFromEnv() (*Client, error) {
	projectURL := os.Getenv("SUPABASE_URL")
	apiKey := os.Getenv("SUPABASE_SERVICE_ROLE_KEY")

	if projectURL == "" || apiKey == "" {
		return nil, fmt.Errorf("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
	}

	return NewClient(Config{
		ProjectURL: projectURL,
		APIKey:     apiKey,
	})
}

type TokenInfo struct {
	UID           string
	Email         string
	EmailVerified bool
	Claims        map[string]interface{}
}

func (c *Client) VerifyToken(ctx context.Context, jwt string) (*TokenInfo, error) {
	// Supabase JWT verification is done via the auth admin API
	// The JWT contains the user ID in the 'sub' claim
	user, err := c.client.Auth.GetUser(jwt)
	if err != nil {
		return nil, fmt.Errorf("verify token: %w", err)
	}

	return &TokenInfo{
		UID:           user.ID.String(),
		Email:         user.Email,
		EmailVerified: user.EmailConfirmedAt != nil,
		Claims:        map[string]interface{}{},
	}, nil
}

type UserInfo struct {
	UID         string
	Email       string
	DisplayName string
	PhotoURL    string
	ProviderID  string
	GithubID    string
}

func (c *Client) GetUser(ctx context.Context, uid string) (*UserInfo, error) {
	user, err := c.client.Auth.GetUserByID(uid)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	info := &UserInfo{
		UID:         user.ID.String(),
		Email:       user.Email,
		DisplayName: user.UserMetadata["full_name"],
		PhotoURL:    user.UserMetadata["avatar_url"],
	}

	// Check if user has GitHub identity
	for _, identity := range user.Identities {
		if identity.Provider == "github" {
			info.ProviderID = "github"
			info.GithubID = identity.ID
			break
		}
	}

	return info, nil
}
