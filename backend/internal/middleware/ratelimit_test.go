package middleware

import "testing"

func TestCategorize_LeavesDrawHistoryOnDefaultBucket(t *testing.T) {
	rl := NewRateLimiter(nil)

	if got := rl.categorize("/api/v1/draws/history"); got != "default" {
		t.Fatalf("categorize(/api/v1/draws/history) = %q, want %q", got, "default")
	}
}

func TestCategorize_OnlyRandomDrawIsRateLimited(t *testing.T) {
	rl := NewRateLimiter(nil)

	// POST /draws (random draw) should be rate limited
	if got := rl.categorize("/api/v1/draws"); got != "draws" {
		t.Fatalf("categorize(/api/v1/draws) = %q, want %q", got, "draws")
	}

	// /draws/choose and other /draws/* endpoints should NOT be rate limited
	// This allows users to swap bookmarks without hitting rate limits
	if got := rl.categorize("/api/v1/draws/choose"); got != "default" {
		t.Fatalf("categorize(/api/v1/draws/choose) = %q, want %q", got, "default")
	}
	if got := rl.categorize("/api/v1/draws/123/status"); got != "default" {
		t.Fatalf("categorize(/api/v1/draws/123/status) = %q, want %q", got, "default")
	}
}
