package service

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"testing"
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
