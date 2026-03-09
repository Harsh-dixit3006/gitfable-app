package middleware

import "testing"

func TestCategorize_LeavesDrawHistoryOnDefaultBucket(t *testing.T) {
	rl := NewRateLimiter(nil)

	if got := rl.categorize("/api/v1/draws/history"); got != "default" {
		t.Fatalf("categorize(/api/v1/draws/history) = %q, want %q", got, "default")
	}
}

func TestCategorize_KeepsDrawMutationsRateLimited(t *testing.T) {
	rl := NewRateLimiter(nil)

	if got := rl.categorize("/api/v1/draws/choose"); got != "draws" {
		t.Fatalf("categorize(/api/v1/draws/choose) = %q, want %q", got, "draws")
	}
	if got := rl.categorize("/api/v1/draws/123/status"); got != "draws" {
		t.Fatalf("categorize(/api/v1/draws/123/status) = %q, want %q", got, "draws")
	}
}
