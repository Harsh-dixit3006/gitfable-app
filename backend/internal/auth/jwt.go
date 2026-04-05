package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	TokenTypeAccess       = "access"
	TokenTypeRefresh      = "refresh"
	TokenTypeRegistration = "registration"
)

type Claims struct {
	Sub       string `json:"sub"`
	Email     string `json:"email,omitempty"`
	TokenType string `json:"token_type"`
	jwt.RegisteredClaims
}

type JWTManager struct {
	secret     []byte
	accessTTL  time.Duration
	refreshTTL time.Duration
}

func NewJWTManager(secret string, accessTTL, refreshTTL time.Duration) (*JWTManager, error) {
	if len(secret) < 32 {
		return nil, fmt.Errorf("JWT secret must be at least 32 characters")
	}
	return &JWTManager{
		secret:     []byte(secret),
		accessTTL:  accessTTL,
		refreshTTL: refreshTTL,
	}, nil
}

// SignAccessToken issues a short-lived access token.
func (m *JWTManager) SignAccessToken(userID, email string) (string, error) {
	return m.sign(userID, email, TokenTypeAccess, m.accessTTL)
}

// SignRefreshToken issues a long-lived refresh token.
func (m *JWTManager) SignRefreshToken(userID string) (string, error) {
	return m.sign(userID, "", TokenTypeRefresh, m.refreshTTL)
}

// SignRegistrationToken issues a short-lived token for new user registration.
// It carries GitHub user info so the frontend can show the registration form.
func (m *JWTManager) SignRegistrationToken(githubID, email string) (string, error) {
	return m.sign(githubID, email, TokenTypeRegistration, 10*time.Minute)
}

func (m *JWTManager) sign(sub, email, tokenType string, ttl time.Duration) (string, error) {
	now := time.Now()
	claims := Claims{
		Sub:       sub,
		Email:     email,
		TokenType: tokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

// Verify parses and validates a JWT, returning the claims.
func (m *JWTManager) Verify(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return m.secret, nil
	})
	if err != nil {
		return nil, fmt.Errorf("invalid token: %w", err)
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, fmt.Errorf("invalid token claims")
	}

	if claims.Sub == "" {
		return nil, fmt.Errorf("token missing sub claim")
	}

	return claims, nil
}
