package middleware

import (
	"net/http"
	"testing"
)

func TestCategorize_GETRequestsUseReadBucket(t *testing.T) {
	tests := []struct {
		path string
		want string
	}{
		{"/api/v1/leaderboard", "read"},
		{"/api/v1/issues", "read"},
		{"/api/v1/stats", "read"},
		{"/api/v1/activity", "read"},
		{"/api/v1/draws/history", "read"},
		{"/api/v1/users/someone", "read"},
	}
	for _, tt := range tests {
		if got := Categorize(tt.path, http.MethodGet); got != tt.want {
			t.Errorf("Categorize(%q, GET) = %q, want %q", tt.path, got, tt.want)
		}
	}
}

func TestCategorize_DrawPostUsesDrawsBucket(t *testing.T) {
	if got := Categorize("/api/v1/draws", http.MethodPost); got != "draws" {
		t.Fatalf("Categorize(/api/v1/draws, POST) = %q, want %q", got, "draws")
	}
}

func TestCategorize_AuthUsesAuthBucket(t *testing.T) {
	tests := []struct {
		path   string
		method string
	}{
		{"/api/v1/auth/register", http.MethodPost},
		{"/api/v1/auth/me", http.MethodGet},
		{"/api/v1/oauth/github", http.MethodGet},
		{"/api/v1/oauth/refresh", http.MethodPost},
	}
	for _, tt := range tests {
		if got := Categorize(tt.path, tt.method); got != "auth" {
			t.Errorf("Categorize(%q, %s) = %q, want %q", tt.path, tt.method, got, "auth")
		}
	}
}

func TestCategorize_NonGETMutationsUseDefaultBucket(t *testing.T) {
	tests := []struct {
		path   string
		method string
	}{
		{"/api/v1/draws/123/status", http.MethodPut},
		{"/api/v1/draws/123/pr", http.MethodPut},
		{"/api/v1/users/filters", http.MethodPut},
	}
	for _, tt := range tests {
		if got := Categorize(tt.path, tt.method); got != "default" {
			t.Errorf("Categorize(%q, %s) = %q, want %q", tt.path, tt.method, got, "default")
		}
	}
}
