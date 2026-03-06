package firebase

import (
	"context"
	"fmt"

	fb "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

type Client struct {
	authClient *auth.Client
}

func NewClient(ctx context.Context, credentialsPath string) (*Client, error) {
	var app *fb.App
	var err error

	if credentialsPath != "" {
		app, err = fb.NewApp(ctx, nil, option.WithCredentialsFile(credentialsPath))
	} else {
		app, err = fb.NewApp(ctx, nil)
	}
	if err != nil {
		return nil, fmt.Errorf("init firebase app: %w", err)
	}

	authClient, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("init firebase auth: %w", err)
	}

	return &Client{authClient: authClient}, nil
}

type TokenInfo struct {
	UID           string
	Email         string
	EmailVerified bool
	Claims        map[string]any
}

func (c *Client) VerifyToken(ctx context.Context, idToken string) (*TokenInfo, error) {
	token, err := c.authClient.VerifyIDToken(ctx, idToken)
	if err != nil {
		return nil, fmt.Errorf("verify token: %w", err)
	}

	email, _ := token.Claims["email"].(string)
	emailVerified, _ := token.Claims["email_verified"].(bool)

	return &TokenInfo{
		UID:           token.UID,
		Email:         email,
		EmailVerified: emailVerified,
		Claims:        token.Claims,
	}, nil
}

type UserInfo struct {
	UID         string
	Email       string
	DisplayName string
	PhotoURL    string
	ProviderID  string
}

func (c *Client) GetUser(ctx context.Context, uid string) (*UserInfo, error) {
	user, err := c.authClient.GetUser(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	info := &UserInfo{
		UID:         user.UID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		PhotoURL:    user.PhotoURL,
	}

	for _, p := range user.ProviderUserInfo {
		if p.ProviderID == "github.com" {
			info.ProviderID = "github.com"
			if info.DisplayName == "" {
				info.DisplayName = p.DisplayName
			}
			if info.PhotoURL == "" {
				info.PhotoURL = p.PhotoURL
			}
			break
		}
	}

	return info, nil
}
