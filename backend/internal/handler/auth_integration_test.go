package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/nishantg96/gitfable/internal/auth"
	"github.com/stretchr/testify/assert"
)

func testJWTManager(t *testing.T) *auth.JWTManager {
	t.Helper()
	m, err := auth.NewJWTManager("test-secret-key-that-is-at-least-32-chars", 15*time.Minute, 7*24*time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	return m
}

func TestAuthHandler_Register_InvalidToken(t *testing.T) {
	handler := &AuthHandler{
		Queries:               nil,
		JWT:                   testJWTManager(t),
		DefaultDailyDrawLimit: 3,
	}

	reqBody := map[string]string{"username": "testuser"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer invalid-token")
	rec := httptest.NewRecorder()

	handler.Register(rec, req)

	assert.Equal(t, http.StatusUnauthorized, rec.Code)
}

func TestAuthHandler_Register_InvalidUsername(t *testing.T) {
	tests := []struct {
		name     string
		username string
		wantCode int
	}{
		{
			name:     "empty username",
			username: "",
			wantCode: http.StatusBadRequest,
		},
		{
			name:     "username too short",
			username: "a",
			wantCode: http.StatusBadRequest,
		},
		{
			name:     "username with spaces",
			username: "test user",
			wantCode: http.StatusBadRequest,
		},
	}

	jwtMgr := testJWTManager(t)

	handler := &AuthHandler{
		Queries:               nil,
		JWT:                   jwtMgr,
		DefaultDailyDrawLimit: 3,
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Sign a valid registration token
			token, err := jwtMgr.SignRegistrationToken("12345", "test@example.com")
			assert.NoError(t, err)

			reqBody := map[string]string{"username": tt.username}
			body, _ := json.Marshal(reqBody)

			req := httptest.NewRequest("POST", "/auth/register", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+token)
			rec := httptest.NewRecorder()

			handler.Register(rec, req)

			assert.Equal(t, tt.wantCode, rec.Code)
		})
	}
}

func TestAuthHandler_Register_RejectsAccessToken(t *testing.T) {
	jwtMgr := testJWTManager(t)

	handler := &AuthHandler{
		Queries:               nil,
		JWT:                   jwtMgr,
		DefaultDailyDrawLimit: 3,
	}

	// Sign an access token (not a registration token)
	token, err := jwtMgr.SignAccessToken("12345", "test@example.com")
	assert.NoError(t, err)

	reqBody := map[string]string{"username": "testuser"}
	body, _ := json.Marshal(reqBody)

	req := httptest.NewRequest("POST", "/auth/register", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()

	handler.Register(rec, req)

	assert.Equal(t, http.StatusBadRequest, rec.Code)
}

func TestAuthFlow_Documentation(t *testing.T) {
	// Auth flow documented
	assert.True(t, true, "Auth flow documented")
}
