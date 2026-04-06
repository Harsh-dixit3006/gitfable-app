package auth

import (
	"testing"
)

func TestAuthorizationURL(t *testing.T) {
	g := NewGitHubOAuth("test-client-id", "test-secret", "http://localhost:8001/api/v1/oauth/github/callback")

	url := g.AuthorizationURL("random-state")

	if url == "" {
		t.Fatal("expected non-empty URL")
	}

	tests := []struct {
		name     string
		contains string
	}{
		{"authorize endpoint", "https://github.com/login/oauth/authorize"},
		{"client_id", "client_id=test-client-id"},
		{"state", "state=random-state"},
		{"scope", "scope=read%3Auser+user%3Aemail"},
		{"redirect_uri", "redirect_uri=http"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if !contains(url, tt.contains) {
				t.Errorf("URL %q does not contain %q", url, tt.contains)
			}
		})
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && searchString(s, substr)
}

func searchString(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
