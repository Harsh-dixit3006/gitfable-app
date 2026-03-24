package supabase

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	gotrue "github.com/supabase-community/gotrue-go"
	gotruetypes "github.com/supabase-community/gotrue-go/types"
)

// publicKey is a union type for RSA and ECDSA public keys.
type publicKey struct {
	rsa   *rsa.PublicKey
	ecdsa *ecdsa.PublicKey
}

// CryptoKey returns the underlying crypto public key for JWT verification.
func (pk *publicKey) CryptoKey() interface{} {
	if pk.ecdsa != nil {
		return pk.ecdsa
	}
	return pk.rsa
}

type Client struct {
	projectURL  string
	auth        gotrue.Client
	httpClient  *http.Client
	jwksMu      sync.RWMutex
	jwks        map[string]*publicKey
	jwksFetched time.Time
}

type Config struct {
	ProjectURL string
	APIKey     string
}

func NewClient(config Config) (*Client, error) {
	if config.ProjectURL == "" {
		return nil, fmt.Errorf("project URL is required")
	}
	if config.APIKey == "" {
		return nil, fmt.Errorf("API key is required")
	}

	// Use gotrue-go directly with the service role key for admin operations.
	// gotrue.New() expects a project reference, not a URL, so we use
	// WithCustomGoTrueURL to set the full GoTrue endpoint.
	gotrueURL := strings.TrimRight(config.ProjectURL, "/") + "/auth/v1"
	authClient := gotrue.New("unused", config.APIKey).
		WithCustomGoTrueURL(gotrueURL).
		WithToken(config.APIKey)

	return &Client{
		projectURL: strings.TrimRight(config.ProjectURL, "/"),
		auth:       authClient,
		httpClient: &http.Client{Timeout: 5 * time.Second},
		jwks:       make(map[string]*publicKey),
	}, nil
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

func (c *Client) VerifyToken(ctx context.Context, tokenString string) (*TokenInfo, error) {
	token, err := jwtv5Parse(tokenString, c.projectURL+"/auth/v1", func(token *jwt.Token) (interface{}, error) {
		kid, _ := token.Header["kid"].(string)
		if kid == "" {
			return nil, fmt.Errorf("token missing kid header")
		}

		pk, keyErr := c.getJWKSKey(ctx, kid)
		if keyErr != nil {
			return nil, keyErr
		}

		return pk.CryptoKey(), nil
	})
	if err != nil {
		return nil, fmt.Errorf("verify token: %w", err)
	}

	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return nil, fmt.Errorf("verify token: invalid claims")
	}

	uid, _ := claims["sub"].(string)
	if uid == "" {
		return nil, fmt.Errorf("verify token: missing sub claim")
	}

	email, _ := claims["email"].(string)

	emailVerified := false
	if value, exists := claims["email_verified"]; exists {
		if verified, ok := value.(bool); ok {
			emailVerified = verified
		}
	}
	if !emailVerified {
		if confirmedAt, ok := claims["email_confirmed_at"]; ok && confirmedAt != nil {
			emailVerified = true
		}
	}

	return &TokenInfo{
		UID:           uid,
		Email:         email,
		EmailVerified: emailVerified,
		Claims:        claims,
	}, nil
}

type jwksDocument struct {
	Keys []jwkKey `json:"keys"`
}

type jwkKey struct {
	KID string `json:"kid"`
	KTY string `json:"kty"`
	ALG string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
	CRV string `json:"crv"`
	X   string `json:"x"`
	Y   string `json:"y"`
}

func (c *Client) getJWKSKey(ctx context.Context, kid string) (*publicKey, error) {
	c.jwksMu.RLock()
	if key, ok := c.jwks[kid]; ok && time.Since(c.jwksFetched) < 5*time.Minute {
		c.jwksMu.RUnlock()
		return key, nil
	}
	c.jwksMu.RUnlock()

	if err := c.refreshJWKS(ctx); err != nil {
		return nil, err
	}

	c.jwksMu.RLock()
	defer c.jwksMu.RUnlock()
	key, ok := c.jwks[kid]
	if !ok {
		return nil, fmt.Errorf("jwks key not found for kid %s", kid)
	}
	return key, nil
}

func (c *Client) refreshJWKS(ctx context.Context) error {
	c.jwksMu.Lock()
	defer c.jwksMu.Unlock()

	if time.Since(c.jwksFetched) < 5*time.Minute && len(c.jwks) > 0 {
		return nil
	}

	endpoint := c.projectURL + "/auth/v1/.well-known/jwks.json"
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return fmt.Errorf("build jwks request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("fetch jwks: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("fetch jwks: unexpected status %d", resp.StatusCode)
	}

	var doc jwksDocument
	if err := json.NewDecoder(resp.Body).Decode(&doc); err != nil {
		return fmt.Errorf("decode jwks: %w", err)
	}

	keys := make(map[string]*publicKey)
	for _, key := range doc.Keys {
		if key.KID == "" {
			continue
		}

		switch key.KTY {
		case "RSA":
			if key.N == "" || key.E == "" {
				continue
			}
			rsaKey, err := jwkToRSAPublicKey(key.N, key.E)
			if err != nil {
				continue
			}
			keys[key.KID] = &publicKey{rsa: rsaKey}

		case "EC":
			if key.X == "" || key.Y == "" || key.CRV == "" {
				continue
			}
			ecKey, err := jwkToECPublicKey(key.CRV, key.X, key.Y)
			if err != nil {
				continue
			}
			keys[key.KID] = &publicKey{ecdsa: ecKey}
		}
	}

	if len(keys) == 0 {
		return fmt.Errorf("decode jwks: no usable keys found")
	}

	c.jwks = keys
	c.jwksFetched = time.Now()
	return nil
}

func jwkToRSAPublicKey(nBase64URL, eBase64URL string) (*rsa.PublicKey, error) {
	nBytes, err := base64.RawURLEncoding.DecodeString(nBase64URL)
	if err != nil {
		return nil, fmt.Errorf("decode modulus: %w", err)
	}
	eBytes, err := base64.RawURLEncoding.DecodeString(eBase64URL)
	if err != nil {
		return nil, fmt.Errorf("decode exponent: %w", err)
	}

	if len(eBytes) == 0 {
		return nil, fmt.Errorf("invalid exponent")
	}

	modulus := new(big.Int).SetBytes(nBytes)
	exponent := 0
	for _, b := range eBytes {
		exponent = exponent<<8 + int(b)
	}
	if exponent <= 0 {
		return nil, fmt.Errorf("invalid exponent value")
	}

	return &rsa.PublicKey{N: modulus, E: exponent}, nil
}

func jwkToECPublicKey(crv, xBase64URL, yBase64URL string) (*ecdsa.PublicKey, error) {
	var curve elliptic.Curve
	switch crv {
	case "P-256":
		curve = elliptic.P256()
	case "P-384":
		curve = elliptic.P384()
	case "P-521":
		curve = elliptic.P521()
	default:
		return nil, fmt.Errorf("unsupported curve: %s", crv)
	}

	xBytes, err := base64.RawURLEncoding.DecodeString(xBase64URL)
	if err != nil {
		return nil, fmt.Errorf("decode x coordinate: %w", err)
	}
	yBytes, err := base64.RawURLEncoding.DecodeString(yBase64URL)
	if err != nil {
		return nil, fmt.Errorf("decode y coordinate: %w", err)
	}

	return &ecdsa.PublicKey{
		Curve: curve,
		X:     new(big.Int).SetBytes(xBytes),
		Y:     new(big.Int).SetBytes(yBytes),
	}, nil
}

func jwtv5Parse(tokenString, expectedIssuer string, keyfunc jwt.Keyfunc) (*jwt.Token, error) {
	parser := jwt.NewParser(
		jwt.WithValidMethods([]string{"RS256", "ES256"}),
		jwt.WithIssuer(expectedIssuer),
		jwt.WithAudience("authenticated"),
	)
	return parser.Parse(tokenString, keyfunc)
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
	_ = ctx
	parsedUID, err := uuid.Parse(uid)
	if err != nil {
		return nil, fmt.Errorf("parse user id: %w", err)
	}

	userResp, err := c.auth.AdminGetUser(gotruetypes.AdminGetUserRequest{UserID: parsedUID})
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	user := userResp.User

	displayName := getStringMetadata(user.UserMetadata, "full_name")
	photoURL := getStringMetadata(user.UserMetadata, "avatar_url")

	info := &UserInfo{
		UID:         user.ID.String(),
		Email:       user.Email,
		DisplayName: displayName,
		PhotoURL:    photoURL,
	}

	for _, identity := range user.Identities {
		if identity.Provider == "github" {
			info.ProviderID = "github"
			info.GithubID = identity.ID
			break
		}
	}

	return info, nil
}

func getStringMetadata(metadata map[string]interface{}, key string) string {
	if metadata == nil {
		return ""
	}
	v, ok := metadata[key]
	if !ok {
		return ""
	}
	s, ok := v.(string)
	if !ok {
		return ""
	}
	return s
}
