package supabase

import (
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
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
