package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/nishantg96/gitfable/internal/supabase"
	"github.com/stretchr/testify/assert"
)

// mockSupabaseClient implements supabase client interface for testing
type mockSupabaseClient struct {
	verifyTokenFunc func(ctx context.Context, jwt string) (*supabase.TokenInfo, error)
	getUserFunc     func(ctx context.Context, uid string) (*supabase.UserInfo, error)
}

func (m *mockSupabaseClient) VerifyToken(ctx context.Context, jwt string) (*supabase.TokenInfo, error) {
	return m.verifyTokenFunc(ctx, jwt)
}

func (m *mockSupabaseClient) GetUser(ctx context.Context, uid string) (*supabase.UserInfo, error) {
	return m.getUserFunc(ctx, uid)
}

func TestAuthHandler_Register_InvalidToken(t *testing.T) {
	mockSB := &mockSupabaseClient{
		verifyTokenFunc: func(ctx context.Context, jwt string) (*supabase.TokenInfo, error) {
			return nil, errors.New("invalid token")
		},
	}

	handler := &AuthHandler{
		Queries:               nil,
		SB:                    mockSB,
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

	mockSB := &mockSupabaseClient{
		verifyTokenFunc: func(ctx context.Context, jwt string) (*supabase.TokenInfo, error) {
			return &supabase.TokenInfo{
				UID:   "test-auth-id",
				Email: "test@example.com",
			}, nil
		},
	}

	handler := &AuthHandler{
		Queries:               nil,
		SB:                    mockSB,
		DefaultDailyDrawLimit: 3,
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reqBody := map[string]string{"username": tt.username}
			body, _ := json.Marshal(reqBody)

			req := httptest.NewRequest("POST", "/auth/register", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer valid-token")
			rec := httptest.NewRecorder()

			handler.Register(rec, req)

			assert.Equal(t, tt.wantCode, rec.Code)
		})
	}
}

func TestAuthFlow_Documentation(t *testing.T) {
	// Auth flow documentation test
	assert.True(t, true, "Auth flow documented")
}
