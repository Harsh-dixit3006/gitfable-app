package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	syncpkg "github.com/nishantg96/gitfable/internal/sync"
	"github.com/redis/go-redis/v9"
)

const (
	issueCheckTTL    = 15 * time.Minute
	issueCachePrefix = "issue_state:"
)

var (
	issueAPIBaseURL = "https://api.github.com"
	graphQLAPIURL   = "https://api.github.com/graphql"
)

const issueAvailabilityQuery = `query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $number) {
      assignees(first: 1) { totalCount }
      labels(first: 20) { nodes { name } }
      comments(last: 20) { nodes { body createdAt authorAssociation } }
      timelineItems(itemTypes: [CROSS_REFERENCED_EVENT], last: 10) {
        nodes {
          ... on CrossReferencedEvent {
            source {
              ... on PullRequest { state }
            }
          }
        }
      }
    }
  }
}`

// IssueState represents the freshness check result for a GitHub issue.
type IssueState struct {
	State string `json:"state"` // "open", "claimed", or "closed"
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

// IsOpen checks whether a GitHub issue is still available for a draw.
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
	url := fmt.Sprintf("%s/repos/%s/%s/issues/%d", issueAPIBaseURL, owner, repo, number)
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
	if issue.State != "open" {
		c.cacheState(ctx, cacheKey, issue.State)
		return false, nil
	}

	claimed, err := c.isClaimed(ctx, owner, repo, int(number))
	if err != nil {
		slog.Warn("issue claim check failed, assuming open", "owner", owner, "repo", repo, "number", number, "error", err)
		c.cacheState(ctx, cacheKey, issue.State)
		return true, nil
	}
	if claimed {
		c.cacheState(ctx, cacheKey, "claimed")
		return false, nil
	}

	c.cacheState(ctx, cacheKey, issue.State)

	return issue.State == "open", nil
}

func (c *IssueChecker) isClaimed(ctx context.Context, owner, repo string, number int) (bool, error) {
	body, err := json.Marshal(map[string]any{
		"query": issueAvailabilityQuery,
		"variables": map[string]any{
			"owner":  owner,
			"repo":   repo,
			"number": number,
		},
	})
	if err != nil {
		return false, fmt.Errorf("marshal graphql request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, graphQLAPIURL, bytes.NewReader(body))
	if err != nil {
		return false, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return false, fmt.Errorf("github graphql request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return false, fmt.Errorf("github graphql returned %d", resp.StatusCode)
	}

	var payload struct {
		Data struct {
			Repository struct {
				Issue *struct {
					Assignees struct {
						TotalCount int `json:"totalCount"`
					} `json:"assignees"`
					Labels struct {
						Nodes []struct {
							Name string `json:"name"`
						} `json:"nodes"`
					} `json:"labels"`
					Comments struct {
						Nodes []struct {
							Body              string `json:"body"`
							CreatedAt         string `json:"createdAt"`
							AuthorAssociation string `json:"authorAssociation"`
						} `json:"nodes"`
					} `json:"comments"`
					TimelineItems struct {
						Nodes []struct {
							Source struct {
								State string `json:"state"`
							} `json:"source"`
						} `json:"nodes"`
					} `json:"timelineItems"`
				} `json:"issue"`
			} `json:"repository"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return false, fmt.Errorf("decode graphql response: %w", err)
	}
	if payload.Data.Repository.Issue == nil {
		return false, nil
	}

	issue := payload.Data.Repository.Issue
	labels := make([]string, 0, len(issue.Labels.Nodes))
	for _, label := range issue.Labels.Nodes {
		labels = append(labels, label.Name)
	}

	hasOpenPR := false
	for _, item := range issue.TimelineItems.Nodes {
		if item.Source.State == "OPEN" {
			hasOpenPR = true
			break
		}
	}

	comments := make([]syncpkg.Comment, 0, len(issue.Comments.Nodes))
	for _, comment := range issue.Comments.Nodes {
		createdAt, parseErr := time.Parse(time.RFC3339, comment.CreatedAt)
		if parseErr != nil {
			continue
		}
		comments = append(comments, syncpkg.Comment{
			Body:       comment.Body,
			CreatedAt:  createdAt,
			AuthorRole: comment.AuthorAssociation,
		})
	}

	return syncpkg.IsClaimed(labels, hasOpenPR, issue.Assignees.TotalCount, comments), nil
}

func (c *IssueChecker) cacheState(ctx context.Context, key, state string) {
	if c.redis == nil {
		return
	}
	if err := c.redis.Set(ctx, key, state, issueCheckTTL).Err(); err != nil {
		slog.Warn("failed to cache issue state", "key", key, "error", err)
	}
}
