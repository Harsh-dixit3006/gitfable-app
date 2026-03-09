package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// generateHMACSHA256 produces a "sha256=<hex>" signature for test verification.
func generateHMACSHA256(payload []byte, secret string) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func TestParsePRURL(t *testing.T) {
	tests := []struct {
		url     string
		owner   string
		repo    string
		number  int
		wantErr bool
	}{
		{"https://github.com/facebook/react/pull/123", "facebook", "react", 123, false},
		{"https://github.com/rust-lang/rust/pull/1", "rust-lang", "rust", 1, false},
		{"https://github.com/a/b/pull/0", "", "", 0, true},
		{"https://gitlab.com/a/b/pull/1", "", "", 0, true},
		{"not-a-url", "", "", 0, true},
		{"https://github.com/a/b/issues/1", "", "", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.url, func(t *testing.T) {
			owner, repo, number, err := ParsePRURL(tt.url)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParsePRURL(%q) error = %v, wantErr %v", tt.url, err, tt.wantErr)
				return
			}
			if !tt.wantErr {
				if owner != tt.owner || repo != tt.repo || number != tt.number {
					t.Errorf("ParsePRURL(%q) = (%q, %q, %d), want (%q, %q, %d)", tt.url, owner, repo, number, tt.owner, tt.repo, tt.number)
				}
			}
		})
	}
}

func TestVerifyWebhookSignature(t *testing.T) {
	payload := []byte(`{"action":"closed"}`)
	secret := "mysecret"

	// Generate valid signature
	validSig := generateHMACSHA256(payload, secret)

	tests := []struct {
		name      string
		payload   []byte
		signature string
		secret    string
		want      bool
	}{
		{"valid signature", payload, validSig, secret, true},
		{"invalid signature", payload, "sha256=invalid", secret, false},
		{"empty secret", payload, validSig, "", false},
		{"empty signature", payload, "", secret, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := VerifyWebhookSignature(tt.payload, tt.signature, tt.secret); got != tt.want {
				t.Errorf("VerifyWebhookSignature() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestPRReferencesIssue(t *testing.T) {
	tests := []struct {
		name   string
		pr     PRStatus
		number int32
		want   bool
	}{
		{name: "body closes issue", pr: PRStatus{Body: "Fixes #42"}, number: 42, want: true},
		{name: "title references issue", pr: PRStatus{Title: "Resolve #42 crash"}, number: 42, want: true},
		{name: "other issue number", pr: PRStatus{Body: "Fixes #99"}, number: 42, want: false},
		{name: "no reference", pr: PRStatus{Title: "Refactor auth"}, number: 42, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := PRReferencesIssue(tt.pr, tt.number); got != tt.want {
				t.Fatalf("PRReferencesIssue() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGetPRStatus_UsesConfiguredToken(t *testing.T) {
	var authHeader string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader = r.Header.Get("Authorization")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"state":"open",
			"merged":false,
			"merged_at":"",
			"merge_commit_sha":"",
			"user":{"login":"octocat"},
			"title":"Fix #42",
			"body":"Fixes #42",
			"html_url":"https://github.com/vercel/next.js/pull/123"
		}`))
	}))
	defer server.Close()

	client := NewGitHubClient("secret-token").(*githubClient)
	client.httpClient = server.Client()
	client.baseURL = server.URL
	client.httpClient.Timeout = time.Second

	_, err := client.GetPRStatus(context.Background(), "vercel", "next.js", 123)
	if err != nil {
		t.Fatalf("GetPRStatus() error = %v, want nil", err)
	}

	if authHeader != "Bearer secret-token" {
		t.Fatalf("Authorization header = %q, want %q", authHeader, "Bearer secret-token")
	}
}
