package supabase

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"math/big"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewClientFromEnv(t *testing.T) {
	tests := []struct {
		name    string
		url     string
		apiKey  string
		wantErr bool
		errMsg  string
	}{
		{
			name:    "valid configuration",
			url:     "https://test.supabase.co",
			apiKey:  "valid-key",
			wantErr: false,
		},
		{
			name:    "missing URL",
			url:     "",
			apiKey:  "valid-key",
			wantErr: true,
			errMsg:  "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set",
		},
		{
			name:    "missing API key",
			url:     "https://test.supabase.co",
			apiKey:  "",
			wantErr: true,
			errMsg:  "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set",
		},
		{
			name:    "both missing",
			url:     "",
			apiKey:  "",
			wantErr: true,
			errMsg:  "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("SUPABASE_URL", tt.url)
			t.Setenv("SUPABASE_SERVICE_ROLE_KEY", tt.apiKey)

			client, err := NewClientFromEnv()
			if tt.wantErr {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errMsg)
				assert.Nil(t, client)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, client)
			}
		})
	}
}

func TestNewClient(t *testing.T) {
	tests := []struct {
		name    string
		config  Config
		wantErr bool
	}{
		{
			name: "valid config",
			config: Config{
				ProjectURL: "https://test.supabase.co",
				APIKey:     "test-key",
			},
			wantErr: false,
		},
		{
			name: "empty URL",
			config: Config{
				ProjectURL: "",
				APIKey:     "test-key",
			},
			wantErr: true,
		},
		{
			name: "empty API key",
			config: Config{
				ProjectURL: "https://test.supabase.co",
				APIKey:     "",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			client, err := NewClient(tt.config)
			if tt.wantErr {
				assert.Error(t, err)
				assert.Nil(t, client)
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, client)
			}
		})
	}
}

func TestGetStringMetadata(t *testing.T) {
	tests := []struct {
		name     string
		metadata map[string]interface{}
		key      string
		want     string
	}{
		{
			name:     "key exists",
			metadata: map[string]interface{}{"full_name": "John Doe"},
			key:      "full_name",
			want:     "John Doe",
		},
		{
			name:     "key missing",
			metadata: map[string]interface{}{"other": "value"},
			key:      "full_name",
			want:     "",
		},
		{
			name:     "nil metadata",
			metadata: nil,
			key:      "full_name",
			want:     "",
		},
		{
			name:     "wrong type",
			metadata: map[string]interface{}{"full_name": 123},
			key:      "full_name",
			want:     "",
		},
		{
			name:     "empty string",
			metadata: map[string]interface{}{"full_name": ""},
			key:      "full_name",
			want:     "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := getStringMetadata(tt.metadata, tt.key)
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestTokenInfo(t *testing.T) {
	info := TokenInfo{
		UID:           "test-uid",
		Email:         "test@example.com",
		EmailVerified: true,
		Claims:        map[string]interface{}{"role": "user"},
	}

	assert.Equal(t, "test-uid", info.UID)
	assert.Equal(t, "test@example.com", info.Email)
	assert.True(t, info.EmailVerified)
	assert.Equal(t, "user", info.Claims["role"])
}

func TestUserInfo(t *testing.T) {
	info := UserInfo{
		UID:         "test-uid",
		Email:       "test@example.com",
		DisplayName: "Test User",
		PhotoURL:    "https://example.com/avatar.jpg",
		ProviderID:  "github",
		GithubID:    "12345",
	}

	assert.Equal(t, "test-uid", info.UID)
	assert.Equal(t, "test@example.com", info.Email)
	assert.Equal(t, "Test User", info.DisplayName)
	assert.Equal(t, "https://example.com/avatar.jpg", info.PhotoURL)
	assert.Equal(t, "github", info.ProviderID)
	assert.Equal(t, "12345", info.GithubID)
}

// Integration test - requires real Supabase credentials
// Run with: go test -run TestIntegration ./internal/supabase/... -v
func TestIntegration(t *testing.T) {
	// Skip if no credentials available
	if os.Getenv("SUPABASE_TEST_URL") == "" || os.Getenv("SUPABASE_TEST_KEY") == "" {
		t.Skip("Skipping integration test - no Supabase test credentials provided")
	}

	client, err := NewClient(Config{
		ProjectURL: os.Getenv("SUPABASE_TEST_URL"),
		APIKey:     os.Getenv("SUPABASE_TEST_KEY"),
	})

	assert.NoError(t, err)
	assert.NotNil(t, client)
}

func TestVerifyToken_LocalJWKSAndCaching(t *testing.T) {
	privateKey := mustGenerateRSAKey(t)
	kid := "kid-1"

	var jwksRequests int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		atomic.AddInt32(&jwksRequests, 1)
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(jwksForKey(kid, &privateKey.PublicKey)))
	}))
	defer server.Close()

	client := &Client{
		projectURL: strings.TrimRight(server.URL, "/"),
		httpClient: server.Client(),
		jwks:       make(map[string]*rsa.PublicKey),
	}

	token := mustSignToken(t, privateKey, kid, jwt.MapClaims{
		"sub":            "user-123",
		"email":          "test@example.com",
		"email_verified": true,
		"iss":            server.URL + "/auth/v1",
		"aud":            "authenticated",
		"exp":            time.Now().Add(1 * time.Hour).Unix(),
	})

	info, err := client.VerifyToken(context.Background(), token)
	require.NoError(t, err)
	assert.Equal(t, "user-123", info.UID)
	assert.Equal(t, "test@example.com", info.Email)
	assert.True(t, info.EmailVerified)

	_, err = client.VerifyToken(context.Background(), token)
	require.NoError(t, err)
	assert.Equal(t, int32(1), atomic.LoadInt32(&jwksRequests))
}

func TestVerifyToken_InvalidAudience(t *testing.T) {
	privateKey := mustGenerateRSAKey(t)
	kid := "kid-2"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(jwksForKey(kid, &privateKey.PublicKey)))
	}))
	defer server.Close()

	client := &Client{
		projectURL: strings.TrimRight(server.URL, "/"),
		httpClient: server.Client(),
		jwks:       make(map[string]*rsa.PublicKey),
	}

	token := mustSignToken(t, privateKey, kid, jwt.MapClaims{
		"sub":   "user-123",
		"email": "test@example.com",
		"iss":   server.URL + "/auth/v1",
		"aud":   "anon",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	})

	_, err := client.VerifyToken(context.Background(), token)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "verify token")
}

func TestVerifyToken_EmailConfirmedFallback(t *testing.T) {
	privateKey := mustGenerateRSAKey(t)
	kid := "kid-3"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(jwksForKey(kid, &privateKey.PublicKey)))
	}))
	defer server.Close()

	client := &Client{
		projectURL: strings.TrimRight(server.URL, "/"),
		httpClient: server.Client(),
		jwks:       make(map[string]*rsa.PublicKey),
	}

	token := mustSignToken(t, privateKey, kid, jwt.MapClaims{
		"sub":                "user-456",
		"email":              "confirmed@example.com",
		"email_confirmed_at": "2026-01-01T00:00:00Z",
		"iss":                server.URL + "/auth/v1",
		"aud":                "authenticated",
		"exp":                time.Now().Add(1 * time.Hour).Unix(),
	})

	info, err := client.VerifyToken(context.Background(), token)
	require.NoError(t, err)
	assert.True(t, info.EmailVerified)
}

func TestVerifyToken_MissingKID(t *testing.T) {
	privateKey := mustGenerateRSAKey(t)

	client := &Client{projectURL: "https://example.supabase.co", jwks: make(map[string]*rsa.PublicKey)}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, jwt.MapClaims{
		"sub":   "user-789",
		"email": "test@example.com",
		"iss":   "https://example.supabase.co/auth/v1",
		"aud":   "authenticated",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	})
	signed, err := token.SignedString(privateKey)
	require.NoError(t, err)

	_, err = client.VerifyToken(context.Background(), signed)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "token missing kid header")
}

func TestVerifyToken_InvalidIssuer(t *testing.T) {
	privateKey := mustGenerateRSAKey(t)
	kid := "kid-4"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(jwksForKey(kid, &privateKey.PublicKey)))
	}))
	defer server.Close()

	client := &Client{
		projectURL: strings.TrimRight(server.URL, "/"),
		httpClient: server.Client(),
		jwks:       make(map[string]*rsa.PublicKey),
	}

	token := mustSignToken(t, privateKey, kid, jwt.MapClaims{
		"sub":   "user-issuer",
		"email": "issuer@example.com",
		"iss":   "https://wrong-issuer.example/auth/v1",
		"aud":   "authenticated",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	})

	_, err := client.VerifyToken(context.Background(), token)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "verify token")
}

func TestVerifyToken_ExpiredToken(t *testing.T) {
	privateKey := mustGenerateRSAKey(t)
	kid := "kid-5"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(jwksForKey(kid, &privateKey.PublicKey)))
	}))
	defer server.Close()

	client := &Client{
		projectURL: strings.TrimRight(server.URL, "/"),
		httpClient: server.Client(),
		jwks:       make(map[string]*rsa.PublicKey),
	}

	token := mustSignToken(t, privateKey, kid, jwt.MapClaims{
		"sub":   "user-exp",
		"email": "expired@example.com",
		"iss":   server.URL + "/auth/v1",
		"aud":   "authenticated",
		"exp":   time.Now().Add(-1 * time.Minute).Unix(),
	})

	_, err := client.VerifyToken(context.Background(), token)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "verify token")
}

func TestVerifyToken_MissingSubClaim(t *testing.T) {
	privateKey := mustGenerateRSAKey(t)
	kid := "kid-6"

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(jwksForKey(kid, &privateKey.PublicKey)))
	}))
	defer server.Close()

	client := &Client{
		projectURL: strings.TrimRight(server.URL, "/"),
		httpClient: server.Client(),
		jwks:       make(map[string]*rsa.PublicKey),
	}

	token := mustSignToken(t, privateKey, kid, jwt.MapClaims{
		"email": "nosub@example.com",
		"iss":   server.URL + "/auth/v1",
		"aud":   "authenticated",
		"exp":   time.Now().Add(1 * time.Hour).Unix(),
	})

	_, err := client.VerifyToken(context.Background(), token)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing sub claim")
}

func TestGetJWKSKey_RefreshesWhenCacheStale(t *testing.T) {
	privateKey := mustGenerateRSAKey(t)
	kid := "kid-stale"

	var requests int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/auth/v1/.well-known/jwks.json" {
			http.NotFound(w, r)
			return
		}
		atomic.AddInt32(&requests, 1)
		w.Header().Set("Content-Type", "application/json")
		require.NoError(t, json.NewEncoder(w).Encode(jwksForKey(kid, &privateKey.PublicKey)))
	}))
	defer server.Close()

	client := &Client{
		projectURL:  strings.TrimRight(server.URL, "/"),
		httpClient:  server.Client(),
		jwks:        map[string]*rsa.PublicKey{"old": &privateKey.PublicKey},
		jwksFetched: time.Now().Add(-10 * time.Minute),
	}

	_, err := client.getJWKSKey(context.Background(), kid)
	require.NoError(t, err)
	assert.Equal(t, int32(1), atomic.LoadInt32(&requests))
}

func TestRefreshJWKS_UnexpectedStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer server.Close()

	client := &Client{
		projectURL: strings.TrimRight(server.URL, "/"),
		httpClient: server.Client(),
		jwks:       make(map[string]*rsa.PublicKey),
	}

	err := client.refreshJWKS(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unexpected status")
}

func TestRefreshJWKS_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte("not-json"))
	}))
	defer server.Close()

	client := &Client{
		projectURL: strings.TrimRight(server.URL, "/"),
		httpClient: server.Client(),
		jwks:       make(map[string]*rsa.PublicKey),
	}

	err := client.refreshJWKS(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "decode jwks")
}

func TestRefreshJWKS_NoRSAKeys(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"keys":[{"kid":"x","kty":"EC"}]}`))
	}))
	defer server.Close()

	client := &Client{
		projectURL: strings.TrimRight(server.URL, "/"),
		httpClient: server.Client(),
		jwks:       make(map[string]*rsa.PublicKey),
	}

	err := client.refreshJWKS(context.Background())
	require.Error(t, err)
	assert.Contains(t, err.Error(), "no RSA keys found")
}

func TestRefreshJWKS_UsesFreshCacheWithoutNetwork(t *testing.T) {
	privateKey := mustGenerateRSAKey(t)
	client := &Client{
		projectURL:  "https://unused.example",
		httpClient:  nil,
		jwks:        map[string]*rsa.PublicKey{"cached": &privateKey.PublicKey},
		jwksFetched: time.Now(),
	}

	err := client.refreshJWKS(context.Background())
	assert.NoError(t, err)
}

func TestJwkToRSAPublicKey(t *testing.T) {
	privateKey := mustGenerateRSAKey(t)
	e := big.NewInt(int64(privateKey.PublicKey.E)).Bytes()

	t.Run("valid jwk", func(t *testing.T) {
		pub, err := jwkToRSAPublicKey(
			base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()),
			base64.RawURLEncoding.EncodeToString(e),
		)
		require.NoError(t, err)
		assert.Equal(t, privateKey.PublicKey.E, pub.E)
		assert.Equal(t, 0, privateKey.PublicKey.N.Cmp(pub.N))
	})

	t.Run("invalid modulus", func(t *testing.T) {
		_, err := jwkToRSAPublicKey("***", base64.RawURLEncoding.EncodeToString(e))
		require.Error(t, err)
		assert.Contains(t, err.Error(), "decode modulus")
	})

	t.Run("invalid exponent", func(t *testing.T) {
		_, err := jwkToRSAPublicKey(base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()), "***")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "decode exponent")
	})

	t.Run("empty exponent", func(t *testing.T) {
		_, err := jwkToRSAPublicKey(base64.RawURLEncoding.EncodeToString(privateKey.PublicKey.N.Bytes()), "")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid exponent")
	})
}

func TestJWTv5Parse_MethodValidation(t *testing.T) {
	hsToken := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "user-hs",
		"iss": "https://example.supabase.co/auth/v1",
		"aud": "authenticated",
		"exp": time.Now().Add(1 * time.Hour).Unix(),
	})
	signed, err := hsToken.SignedString([]byte("secret"))
	require.NoError(t, err)

	_, err = jwtv5Parse(signed, "https://example.supabase.co/auth/v1", func(token *jwt.Token) (interface{}, error) {
		return []byte("secret"), nil
	})
	require.Error(t, err)
	assert.Contains(t, err.Error(), "signing method")
}

func mustGenerateRSAKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	privateKey, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return privateKey
}

func mustSignToken(t *testing.T, privateKey *rsa.PrivateKey, kid string, claims jwt.MapClaims) string {
	t.Helper()
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = kid
	signed, err := token.SignedString(privateKey)
	require.NoError(t, err)
	return signed
}

func jwksForKey(kid string, publicKey *rsa.PublicKey) jwksDocument {
	e := big.NewInt(int64(publicKey.E)).Bytes()
	return jwksDocument{
		Keys: []jwkKey{
			{
				KID: kid,
				KTY: "RSA",
				ALG: "RS256",
				N:   base64.RawURLEncoding.EncodeToString(publicKey.N.Bytes()),
				E:   base64.RawURLEncoding.EncodeToString(e),
			},
		},
	}
}
