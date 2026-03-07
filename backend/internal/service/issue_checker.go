package service

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
)

const (
	issueCheckTTL    = 15 * time.Minute
	issueCachePrefix = "issue_state:"
)

// IssueState represents the freshness check result for a GitHub issue.
type IssueState struct {
	State string `json:"state"` // "open" or "closed"
}

// IssueChecker verifies whether a GitHub issue is still open,
// with Redis caching to avoid redundant API calls.
type IssueChecker struct {
	httpClient *http.Client
	redis      *redis.Client // nil = no caching
}

// NewIssueChecker creates an IssueChecker. redis can be nil (caching disabled).
func NewIssueChecker(redisClient *redis.Client) *IssueChecker {
	return &IssueChecker{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		redis:      redisClient,
	}
}

// IsOpen checks whether a GitHub issue is still open.
// Results are cached in Redis for 15 minutes keyed by issue URL.
func (c *IssueChecker) IsOpen(ctx context.Context, owner, repo string, number int32) (bool, error) {
	cacheKey := fmt.Sprintf("%s%s/%s/%d", issueCachePrefix, owner, repo, number)

	// Check cache first.
	if c.redis != nil {
		val, err := c.redis.Get(ctx, cacheKey).Result()
		if err == nil {
			return val == "open", nil
		}
		// Cache miss or error — fall through to API.
	}

	// Hit GitHub REST API.
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/issues/%d", owner, repo, number)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return false, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("github api request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		c.cacheState(ctx, cacheKey, "closed")
		return false, nil
	}
	if resp.StatusCode != http.StatusOK {
		// On rate limit or other errors, assume open (fail-open).
		slog.Warn("issue check API error, assuming open", "status", resp.StatusCode, "owner", owner, "repo", repo, "number", number)
		return true, nil
	}

	var issue struct {
		State string `json:"state"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&issue); err != nil {
		return false, fmt.Errorf("decode response: %w", err)
	}

	c.cacheState(ctx, cacheKey, issue.State)

	return issue.State == "open", nil
}

func (c *IssueChecker) cacheState(ctx context.Context, key, state string) {
	if c.redis == nil {
		return
	}
	if err := c.redis.Set(ctx, key, state, issueCheckTTL).Err(); err != nil {
		slog.Warn("failed to cache issue state", "key", key, "error", err)
	}
}
