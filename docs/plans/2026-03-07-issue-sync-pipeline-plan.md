# Issue Sync Pipeline Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a GitHub GraphQL-based issue ingestion pipeline that keeps the `issues` table populated with fresh, high-quality "good first issues" across 15 languages.

**Architecture:** Background sync service fetches issues via GitHub GraphQL Search API every 6 hours, scores difficulty, and upserts into PostgreSQL. A stale checker runs every 12 hours to mark closed issues. A CLI command enables on-demand syncs. Draw queries use `NOT EXISTS` to deduplicate per user.

**Tech Stack:** Go, GitHub GraphQL API, pgx/PostgreSQL, sqlc

**Design doc:** `docs/plans/2026-03-07-issue-sync-pipeline-design.md`

---

### Task 1: Schema Changes — Add New Columns to Issues Table

**Files:**
- Modify: `backend/sql/migrations/001_initial.up.sql:35-49`

**Step 1: Add new columns to the issues table definition**

In `backend/sql/migrations/001_initial.up.sql`, update the `issues` table to add four new columns. The table should become:

```sql
CREATE TABLE issues (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    github_id BIGINT NOT NULL UNIQUE,
    github_number INTEGER NOT NULL DEFAULT 0,
    repo_owner VARCHAR(255) NOT NULL,
    repo_name VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    language VARCHAR(50),
    difficulty VARCHAR(20),
    repo_stars INTEGER NOT NULL DEFAULT 0,
    repo_pushed_at TIMESTAMPTZ,
    github_created_at TIMESTAMPTZ,
    labels TEXT[] NOT NULL DEFAULT '{}',
    state issue_state NOT NULL DEFAULT 'open',
    last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Also add the draw deduplication index after the existing draws indexes:

```sql
CREATE INDEX idx_draws_user_issue ON draws(user_id, issue_id);
```

**Step 2: Commit**

```bash
git add backend/sql/migrations/001_initial.up.sql
git commit -m "feat: add github_number, repo_pushed_at, github_created_at, last_synced_at to issues table"
```

---

### Task 2: SQL Queries — Upsert and Stale Check Queries

**Files:**
- Modify: `backend/sql/queries/issues.sql`

**Step 1: Add new queries to issues.sql**

Append these queries to `backend/sql/queries/issues.sql`:

```sql
-- name: UpsertIssue :one
INSERT INTO issues (
    github_id, github_number, repo_owner, repo_name, title, url,
    language, difficulty, repo_stars, repo_pushed_at, github_created_at,
    labels, state, last_synced_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
ON CONFLICT (github_id) DO UPDATE SET
    title = EXCLUDED.title,
    repo_stars = EXCLUDED.repo_stars,
    labels = EXCLUDED.labels,
    difficulty = EXCLUDED.difficulty,
    repo_pushed_at = EXCLUDED.repo_pushed_at,
    last_synced_at = NOW(),
    state = EXCLUDED.state
RETURNING *;

-- name: GetStaleIssues :many
SELECT * FROM issues
WHERE state = 'open'
ORDER BY last_synced_at ASC
LIMIT $1;

-- name: MarkIssueClosed :exec
UPDATE issues SET state = 'closed', last_synced_at = NOW() WHERE id = $1;

-- name: UpdateIssueSyncedAt :exec
UPDATE issues SET last_synced_at = NOW() WHERE id = $1;

-- name: CountOpenIssues :one
SELECT COUNT(*) FROM issues WHERE state = 'open';

-- name: CountOpenIssuesByLanguage :many
SELECT language, COUNT(*) as count FROM issues WHERE state = 'open' GROUP BY language ORDER BY count DESC;
```

**Step 2: Update the draw queries to support NOT EXISTS deduplication**

Also update `GetRandomIssue` and `CountFilteredIssues` in `backend/sql/queries/issues.sql` to accept a user_id parameter for deduplication:

```sql
-- name: CountFilteredIssuesForUser :one
SELECT COUNT(*) FROM issues
WHERE state = 'open'
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'))
  AND NOT EXISTS (
    SELECT 1 FROM draws d WHERE d.issue_id = issues.id AND d.user_id = $1
  );

-- name: GetRandomIssueForUser :one
SELECT * FROM issues
WHERE state = 'open'
  AND (sqlc.narg('language')::varchar IS NULL OR language = sqlc.narg('language'))
  AND (sqlc.narg('difficulty')::varchar IS NULL OR difficulty = sqlc.narg('difficulty'))
  AND NOT EXISTS (
    SELECT 1 FROM draws d WHERE d.issue_id = issues.id AND d.user_id = $1
  )
OFFSET $2
LIMIT 1;
```

Keep the old `CountFilteredIssues` and `GetRandomIssue` queries as-is (they're used by the public listing which doesn't need dedup).

**Step 3: Update CreateIssue to include new columns**

Replace the existing `CreateIssue` query:

```sql
-- name: CreateIssue :one
INSERT INTO issues (github_id, github_number, repo_owner, repo_name, title, url, language, difficulty, repo_stars, repo_pushed_at, github_created_at, labels, state)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
RETURNING *;
```

**Step 4: Run sqlc generate**

Run: `cd backend && sqlc generate`
Expected: No errors. New Go files regenerated in `internal/database/`.

**Step 5: Commit**

```bash
git add backend/sql/queries/issues.sql backend/internal/database/
git commit -m "feat: add upsert, stale check, and dedup queries for issue sync"
```

---

### Task 3: Config — Add Sync-Related Environment Variables

**Files:**
- Modify: `backend/internal/config/config.go:10-28` (Config struct)
- Modify: `backend/internal/config/config.go:31-57` (Load function)

**Step 1: Add sync fields to Config struct**

Add these fields to the `Config` struct:

```go
GitHubToken   string
SyncInterval  time.Duration
StaleInterval time.Duration
SyncEnabled   bool
```

Add `"time"` to the imports.

**Step 2: Add loading logic in Load()**

Add to the `cfg` initialization in `Load()`:

```go
GitHubToken:   getEnv("GITHUB_TOKEN", ""),
SyncInterval:  getEnvDuration("SYNC_INTERVAL", 6*time.Hour),
StaleInterval: getEnvDuration("STALE_INTERVAL", 12*time.Hour),
SyncEnabled:   getEnvBool("SYNC_ENABLED", true),
```

**Step 3: Add getEnvDuration helper**

Add this function after `getEnvBool`:

```go
func getEnvDuration(key string, fallback time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return fallback
}
```

**Step 4: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: No errors.

**Step 5: Commit**

```bash
git add backend/internal/config/config.go
git commit -m "feat: add GITHUB_TOKEN, SYNC_INTERVAL, STALE_INTERVAL config vars"
```

---

### Task 4: Difficulty Scoring — Configurable Label + Star Heuristic

**Files:**
- Create: `backend/internal/sync/difficulty.go`
- Create: `backend/internal/sync/difficulty_test.go`

**Step 1: Write the failing tests**

Create `backend/internal/sync/difficulty_test.go`:

```go
package sync

import "testing"

func TestScoreDifficulty(t *testing.T) {
	tests := []struct {
		name      string
		labels    []string
		repoStars int32
		want      string
	}{
		// Label-only (mid-range stars)
		{"good first issue on mid repo", []string{"good first issue", "bug"}, 5000, "Beginner"},
		{"beginner label", []string{"beginner"}, 5000, "Beginner"},
		{"easy label", []string{"easy"}, 5000, "Beginner"},
		{"starter label", []string{"starter"}, 5000, "Beginner"},
		{"first-timers-only label", []string{"first-timers-only"}, 5000, "Beginner"},
		{"help wanted on mid repo", []string{"help wanted"}, 5000, "Intermediate"},
		{"medium label", []string{"medium"}, 5000, "Intermediate"},
		{"advanced label", []string{"advanced"}, 5000, "Advanced"},
		{"hard label", []string{"hard"}, 5000, "Advanced"},
		{"expert label", []string{"expert"}, 5000, "Advanced"},
		{"complex label", []string{"complex"}, 5000, "Advanced"},
		{"no matching label", []string{"bug", "enhancement"}, 5000, "Intermediate"},

		// Star modifiers
		{"good first issue on small repo", []string{"good first issue"}, 300, "Beginner"},
		{"good first issue on huge repo", []string{"good first issue"}, 120000, "Intermediate"},
		{"help wanted on small repo", []string{"help wanted"}, 500, "Beginner"},
		{"help wanted on huge repo", []string{"help wanted"}, 80000, "Advanced"},
		{"advanced on small repo", []string{"advanced"}, 200, "Intermediate"},
		{"advanced on huge repo", []string{"advanced"}, 200000, "Advanced"},

		// Clamping
		{"beginner on tiny repo clamps to 0", []string{"beginner"}, 10, "Beginner"},
		{"advanced on massive repo clamps to 2", []string{"advanced"}, 500000, "Advanced"},

		// Empty labels
		{"empty labels mid repo", []string{}, 5000, "Intermediate"},
		{"nil labels mid repo", nil, 5000, "Intermediate"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ScoreDifficulty(tt.labels, tt.repoStars)
			if got != tt.want {
				t.Errorf("ScoreDifficulty(%v, %d) = %q, want %q", tt.labels, tt.repoStars, got, tt.want)
			}
		})
	}
}
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/sync/ -run TestScoreDifficulty -v`
Expected: FAIL — package doesn't exist yet.

**Step 3: Write the implementation**

Create `backend/internal/sync/difficulty.go`:

```go
package sync

import "strings"

// Label-to-score mappings. Configurable — edit these to tune difficulty.
var (
	BeginnerLabels     = []string{"good first issue", "beginner", "easy", "starter", "first-timers-only"}
	IntermediateLabels = []string{"help wanted", "medium", "intermediate"}
	AdvancedLabels     = []string{"advanced", "hard", "expert", "complex"}

	// Repo star thresholds for complexity modifier.
	SmallRepoMaxStars = int32(1000)
	LargeRepoMinStars = int32(50000)
)

// Difficulty level names.
const (
	DifficultyBeginner     = "Beginner"
	DifficultyIntermediate = "Intermediate"
	DifficultyAdvanced     = "Advanced"
)

// ScoreDifficulty computes a difficulty string from issue labels and repo star count.
// Returns one of: "Beginner", "Intermediate", "Advanced".
func ScoreDifficulty(labels []string, repoStars int32) string {
	labelScore := scoreLabelSet(labels)
	modifier := repoModifier(repoStars)

	raw := labelScore + modifier
	if raw < 0 {
		raw = 0
	}
	if raw > 2 {
		raw = 2
	}

	switch raw {
	case 0:
		return DifficultyBeginner
	case 2:
		return DifficultyAdvanced
	default:
		return DifficultyIntermediate
	}
}

func scoreLabelSet(labels []string) int {
	for _, label := range labels {
		lower := strings.ToLower(label)
		for _, b := range BeginnerLabels {
			if lower == b {
				return 0
			}
		}
	}
	for _, label := range labels {
		lower := strings.ToLower(label)
		for _, a := range AdvancedLabels {
			if lower == a {
				return 2
			}
		}
	}
	for _, label := range labels {
		lower := strings.ToLower(label)
		for _, m := range IntermediateLabels {
			if lower == m {
				return 1
			}
		}
	}
	return 1 // default
}

func repoModifier(stars int32) int {
	if stars < SmallRepoMaxStars {
		return -1
	}
	if stars > LargeRepoMinStars {
		return 1
	}
	return 0
}
```

**Step 4: Run tests to verify they pass**

Run: `cd backend && go test ./internal/sync/ -run TestScoreDifficulty -v`
Expected: All PASS.

**Step 5: Commit**

```bash
git add backend/internal/sync/difficulty.go backend/internal/sync/difficulty_test.go
git commit -m "feat: add configurable difficulty scoring algorithm"
```

---

### Task 5: GraphQL Client — Query Construction and Response Parsing

**Files:**
- Create: `backend/internal/sync/graphql.go`
- Create: `backend/internal/sync/graphql_test.go`

**Step 1: Write the failing tests**

Create `backend/internal/sync/graphql_test.go`:

```go
package sync

import (
	"encoding/json"
	"testing"
	"time"
)

func TestBuildSearchQuery(t *testing.T) {
	tests := []struct {
		name     string
		language string
		want     string
	}{
		{"go", "Go", `label:"good first issue" language:Go state:open sort:updated`},
		{"javascript", "JavaScript", `label:"good first issue" language:JavaScript state:open sort:updated`},
		{"c++", "C++", `label:"good first issue" language:C++ state:open sort:updated`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := BuildSearchQuery(tt.language)
			if got != tt.want {
				t.Errorf("BuildSearchQuery(%q) = %q, want %q", tt.language, got, tt.want)
			}
		})
	}
}

func TestParseSearchResponse(t *testing.T) {
	raw := `{
		"data": {
			"search": {
				"issueCount": 1,
				"pageInfo": {"hasNextPage": false, "endCursor": "abc123"},
				"nodes": [{
					"number": 42,
					"title": "Fix bug",
					"url": "https://github.com/owner/repo/issues/42",
					"state": "OPEN",
					"createdAt": "2026-01-15T10:00:00Z",
					"labels": {"nodes": [{"name": "good first issue"}, {"name": "bug"}]},
					"repository": {
						"owner": {"login": "owner"},
						"name": "repo",
						"stargazerCount": 5000,
						"pushedAt": "2026-03-01T12:00:00Z",
						"primaryLanguage": {"name": "Go"}
					}
				}]
			}
		}
	}`

	result, err := ParseSearchResponse([]byte(raw))
	if err != nil {
		t.Fatalf("ParseSearchResponse() error = %v", err)
	}

	if result.IssueCount != 1 {
		t.Errorf("IssueCount = %d, want 1", result.IssueCount)
	}
	if result.PageInfo.HasNextPage {
		t.Error("HasNextPage = true, want false")
	}
	if result.PageInfo.EndCursor != "abc123" {
		t.Errorf("EndCursor = %q, want %q", result.PageInfo.EndCursor, "abc123")
	}
	if len(result.Issues) != 1 {
		t.Fatalf("len(Issues) = %d, want 1", len(result.Issues))
	}

	issue := result.Issues[0]
	if issue.Number != 42 {
		t.Errorf("Number = %d, want 42", issue.Number)
	}
	if issue.Title != "Fix bug" {
		t.Errorf("Title = %q, want %q", issue.Title, "Fix bug")
	}
	if issue.RepoOwner != "owner" {
		t.Errorf("RepoOwner = %q, want %q", issue.RepoOwner, "owner")
	}
	if issue.RepoName != "repo" {
		t.Errorf("RepoName = %q, want %q", issue.RepoName, "repo")
	}
	if issue.RepoStars != 5000 {
		t.Errorf("RepoStars = %d, want 5000", issue.RepoStars)
	}
	if issue.Language != "Go" {
		t.Errorf("Language = %q, want %q", issue.Language, "Go")
	}
	if len(issue.Labels) != 2 {
		t.Errorf("len(Labels) = %d, want 2", len(issue.Labels))
	}
}

func TestParseSearchResponse_SkipsNonIssueNodes(t *testing.T) {
	raw := `{
		"data": {
			"search": {
				"issueCount": 0,
				"pageInfo": {"hasNextPage": false, "endCursor": ""},
				"nodes": [null]
			}
		}
	}`

	result, err := ParseSearchResponse([]byte(raw))
	if err != nil {
		t.Fatalf("ParseSearchResponse() error = %v", err)
	}
	if len(result.Issues) != 0 {
		t.Errorf("len(Issues) = %d, want 0", len(result.Issues))
	}
}

func TestParseStaleCheckResponse(t *testing.T) {
	raw := `{
		"data": {
			"i0": {"url": "https://github.com/a/b/issues/1", "state": "CLOSED"},
			"i1": {"url": "https://github.com/c/d/issues/2", "state": "OPEN"}
		}
	}`

	results, err := ParseStaleCheckResponse([]byte(raw))
	if err != nil {
		t.Fatalf("ParseStaleCheckResponse() error = %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("len(results) = %d, want 2", len(results))
	}

	// Find the closed one.
	var found bool
	for _, r := range results {
		if r.URL == "https://github.com/a/b/issues/1" && r.State == "CLOSED" {
			found = true
		}
	}
	if !found {
		t.Error("expected to find CLOSED issue")
	}
}

func TestBuildGraphQLRequestBody(t *testing.T) {
	body := BuildGraphQLRequestBody("query { viewer { login } }", map[string]any{"foo": "bar"})

	var parsed map[string]any
	if err := json.Unmarshal(body, &parsed); err != nil {
		t.Fatalf("invalid JSON: %v", err)
	}
	if parsed["query"] != "query { viewer { login } }" {
		t.Errorf("query mismatch")
	}
	vars := parsed["variables"].(map[string]any)
	if vars["foo"] != "bar" {
		t.Errorf("variables mismatch")
	}
}

func TestFilterIssue(t *testing.T) {
	now := time.Now()
	old := now.Add(-180 * 24 * time.Hour) // 180 days ago

	tests := []struct {
		name      string
		stars     int32
		pushedAt  time.Time
		wantKeep  bool
	}{
		{"good repo", 100, now, true},
		{"too few stars", 10, now, false},
		{"inactive repo", 100, old, false},
		{"borderline stars", 50, now, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := FilterIssue(tt.stars, tt.pushedAt, MinRepoStars, MaxRepoInactiveDays)
			if got != tt.wantKeep {
				t.Errorf("FilterIssue(stars=%d) = %v, want %v", tt.stars, got, tt.wantKeep)
			}
		})
	}
}
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && go test ./internal/sync/ -run TestBuild -v`
Expected: FAIL — functions don't exist.

**Step 3: Write the implementation**

Create `backend/internal/sync/graphql.go`:

```go
package sync

import (
	"encoding/json"
	"fmt"
	"time"
)

// Configurable filter thresholds.
var (
	MinRepoStars        = int32(50)
	MaxRepoInactiveDays = 90
)

// SearchQuery is the GraphQL query for fetching issues by language.
const SearchQuery = `query($query: String!, $cursor: String) {
  search(query: $query, type: ISSUE, first: 100, after: $cursor) {
    issueCount
    pageInfo {
      hasNextPage
      endCursor
    }
    nodes {
      ... on Issue {
        number
        title
        url
        state
        createdAt
        labels(first: 20) {
          nodes { name }
        }
        repository {
          owner { login }
          name
          stargazerCount
          pushedAt
          primaryLanguage { name }
        }
      }
    }
  }
}`

// StaleCheckQueryTemplate builds a query with aliased resource lookups.
// Each issue URL gets its own alias: i0, i1, i2, ...
func BuildStaleCheckQuery(urls []string) string {
	q := "query {\n"
	for i, url := range urls {
		q += fmt.Sprintf("  i%d: resource(url: %q) {\n", i, url)
		q += "    ... on Issue { url state }\n"
		q += "  }\n"
	}
	q += "}"
	return q
}

// BuildSearchQuery constructs the GitHub search string for a language.
func BuildSearchQuery(language string) string {
	return fmt.Sprintf(`label:"good first issue" language:%s state:open sort:updated`, language)
}

// BuildGraphQLRequestBody creates the JSON request body for a GraphQL query.
func BuildGraphQLRequestBody(query string, variables map[string]any) []byte {
	body := map[string]any{
		"query":     query,
		"variables": variables,
	}
	data, _ := json.Marshal(body)
	return data
}

// FilterIssue returns true if the issue's repo meets quality thresholds.
func FilterIssue(repoStars int32, repoPushedAt time.Time, minStars int32, maxInactiveDays int) bool {
	if repoStars < minStars {
		return false
	}
	cutoff := time.Now().Add(-time.Duration(maxInactiveDays) * 24 * time.Hour)
	return repoPushedAt.After(cutoff)
}

// --- Response types ---

type SearchResult struct {
	IssueCount int
	PageInfo   PageInfo
	Issues     []ParsedIssue
}

type PageInfo struct {
	HasNextPage bool
	EndCursor   string
}

type ParsedIssue struct {
	Number    int
	Title     string
	URL       string
	State     string
	CreatedAt time.Time
	Labels    []string
	RepoOwner string
	RepoName  string
	RepoStars int32
	PushedAt  time.Time
	Language  string
}

type StaleCheckResult struct {
	URL   string
	State string
}

// ParseSearchResponse parses the GraphQL search response JSON.
func ParseSearchResponse(data []byte) (*SearchResult, error) {
	var resp struct {
		Data struct {
			Search struct {
				IssueCount int `json:"issueCount"`
				PageInfo   struct {
					HasNextPage bool   `json:"hasNextPage"`
					EndCursor   string `json:"endCursor"`
				} `json:"pageInfo"`
				Nodes []json.RawMessage `json:"nodes"`
			} `json:"search"`
		} `json:"data"`
	}

	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal search response: %w", err)
	}

	result := &SearchResult{
		IssueCount: resp.Data.Search.IssueCount,
		PageInfo: PageInfo{
			HasNextPage: resp.Data.Search.PageInfo.HasNextPage,
			EndCursor:   resp.Data.Search.PageInfo.EndCursor,
		},
	}

	for _, raw := range resp.Data.Search.Nodes {
		if string(raw) == "null" {
			continue
		}

		var node struct {
			Number    int    `json:"number"`
			Title     string `json:"title"`
			URL       string `json:"url"`
			State     string `json:"state"`
			CreatedAt string `json:"createdAt"`
			Labels    struct {
				Nodes []struct {
					Name string `json:"name"`
				} `json:"nodes"`
			} `json:"labels"`
			Repository struct {
				Owner struct {
					Login string `json:"login"`
				} `json:"owner"`
				Name            string `json:"name"`
				StargazerCount  int32  `json:"stargazerCount"`
				PushedAt        string `json:"pushedAt"`
				PrimaryLanguage *struct {
					Name string `json:"name"`
				} `json:"primaryLanguage"`
			} `json:"repository"`
		}

		if err := json.Unmarshal(raw, &node); err != nil {
			continue // skip malformed nodes
		}

		if node.Title == "" || node.Repository.Owner.Login == "" {
			continue // skip incomplete data
		}

		createdAt, _ := time.Parse(time.RFC3339, node.CreatedAt)
		pushedAt, _ := time.Parse(time.RFC3339, node.Repository.PushedAt)

		labels := make([]string, len(node.Labels.Nodes))
		for i, l := range node.Labels.Nodes {
			labels[i] = l.Name
		}

		language := ""
		if node.Repository.PrimaryLanguage != nil {
			language = node.Repository.PrimaryLanguage.Name
		}

		result.Issues = append(result.Issues, ParsedIssue{
			Number:    node.Number,
			Title:     node.Title,
			URL:       node.URL,
			State:     node.State,
			CreatedAt: createdAt,
			Labels:    labels,
			RepoOwner: node.Repository.Owner.Login,
			RepoName:  node.Repository.Name,
			RepoStars: node.Repository.StargazerCount,
			PushedAt:  pushedAt,
			Language:  language,
		})
	}

	return result, nil
}

// ParseStaleCheckResponse parses the aliased resource lookup response.
func ParseStaleCheckResponse(data []byte) ([]StaleCheckResult, error) {
	var resp struct {
		Data map[string]json.RawMessage `json:"data"`
	}

	if err := json.Unmarshal(data, &resp); err != nil {
		return nil, fmt.Errorf("unmarshal stale check response: %w", err)
	}

	var results []StaleCheckResult
	for _, raw := range resp.Data {
		var node struct {
			URL   string `json:"url"`
			State string `json:"state"`
		}
		if err := json.Unmarshal(raw, &node); err != nil {
			continue
		}
		if node.URL != "" {
			results = append(results, StaleCheckResult{
				URL:   node.URL,
				State: node.State,
			})
		}
	}

	return results, nil
}
```

**Step 4: Run all tests**

Run: `cd backend && go test ./internal/sync/ -v`
Expected: All PASS.

**Step 5: Commit**

```bash
git add backend/internal/sync/graphql.go backend/internal/sync/graphql_test.go
git commit -m "feat: add GraphQL query builder and response parser for issue sync"
```

---

### Task 6: Sync Service — Core Fetch and Upsert Logic

**Files:**
- Create: `backend/internal/sync/sync.go`

**Step 1: Write the SyncService**

Create `backend/internal/sync/sync.go`:

```go
package sync

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/nishantg96/gitfable/internal/database"
)

const graphqlEndpoint = "https://api.github.com/graphql"

// Default languages to sync, ordered by tier.
var DefaultLanguages = []string{
	// High demand
	"JavaScript", "TypeScript", "Python", "Go", "Rust", "Java",
	// Mid demand
	"C++", "C#", "Ruby", "PHP", "Swift",
	// Emerging
	"Kotlin", "Dart", "Scala", "Elixir",
}

// DegradedLanguages is the subset used when no GITHUB_TOKEN is set.
var DegradedLanguages = []string{"JavaScript", "Python"}

type SyncService struct {
	queries       *database.Queries
	httpClient    *http.Client
	token         string
	languages     []string
	interval      time.Duration
	staleInterval time.Duration
	stopCh        chan struct{}
}

func NewSyncService(queries *database.Queries, token string, interval, staleInterval time.Duration) *SyncService {
	languages := DefaultLanguages
	if token == "" {
		languages = DegradedLanguages
		slog.Warn("GITHUB_TOKEN not set — sync will run in degraded mode (2 languages only)")
	}

	return &SyncService{
		queries:       queries,
		httpClient:    &http.Client{Timeout: 30 * time.Second},
		token:         token,
		languages:     languages,
		interval:      interval,
		staleInterval: staleInterval,
		stopCh:        make(chan struct{}),
	}
}

// Start runs the sync and stale checker as background goroutines.
func (s *SyncService) Start(ctx context.Context) {
	go s.syncLoop(ctx)
	go s.staleLoop(ctx)
	slog.Info("sync service started", "languages", len(s.languages), "interval", s.interval, "stale_interval", s.staleInterval)
}

// Stop signals the background goroutines to stop.
func (s *SyncService) Stop() {
	close(s.stopCh)
}

// RunOnce performs a full sync + stale check, then returns.
func (s *SyncService) RunOnce(ctx context.Context) error {
	slog.Info("running full sync")
	if err := s.syncAll(ctx); err != nil {
		return fmt.Errorf("sync: %w", err)
	}
	slog.Info("running stale check")
	if err := s.checkStale(ctx); err != nil {
		return fmt.Errorf("stale check: %w", err)
	}
	return nil
}

func (s *SyncService) syncLoop(ctx context.Context) {
	// Run once immediately on start.
	if err := s.syncAll(ctx); err != nil {
		slog.Error("initial sync failed", "error", err)
	}

	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := s.syncAll(ctx); err != nil {
				slog.Error("sync failed", "error", err)
			}
		case <-s.stopCh:
			return
		case <-ctx.Done():
			return
		}
	}
}

func (s *SyncService) staleLoop(ctx context.Context) {
	ticker := time.NewTicker(s.staleInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			if err := s.checkStale(ctx); err != nil {
				slog.Error("stale check failed", "error", err)
			}
		case <-s.stopCh:
			return
		case <-ctx.Done():
			return
		}
	}
}

func (s *SyncService) syncAll(ctx context.Context) error {
	totalUpserted := 0
	totalSkipped := 0

	for _, lang := range s.languages {
		upserted, skipped, err := s.syncLanguage(ctx, lang)
		if err != nil {
			slog.Error("sync language failed", "language", lang, "error", err)
			continue // don't abort entire sync for one language failure
		}
		totalUpserted += upserted
		totalSkipped += skipped
		slog.Info("synced language", "language", lang, "upserted", upserted, "skipped", skipped)

		// Rate limit: sleep between languages.
		select {
		case <-time.After(2 * time.Second):
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	slog.Info("sync complete", "total_upserted", totalUpserted, "total_skipped", totalSkipped)
	return nil
}

func (s *SyncService) syncLanguage(ctx context.Context, language string) (upserted, skipped int, err error) {
	searchQuery := BuildSearchQuery(language)
	var cursor *string

	for {
		variables := map[string]any{
			"query": searchQuery,
		}
		if cursor != nil {
			variables["cursor"] = *cursor
		}

		body := BuildGraphQLRequestBody(SearchQuery, variables)
		respData, err := s.doGraphQL(ctx, body)
		if err != nil {
			return upserted, skipped, fmt.Errorf("graphql request: %w", err)
		}

		result, err := ParseSearchResponse(respData)
		if err != nil {
			return upserted, skipped, fmt.Errorf("parse response: %w", err)
		}

		for _, issue := range result.Issues {
			if !FilterIssue(issue.RepoStars, issue.PushedAt, MinRepoStars, MaxRepoInactiveDays) {
				skipped++
				continue
			}

			difficulty := ScoreDifficulty(issue.Labels, issue.RepoStars)
			langValue := issue.Language
			if langValue == "" {
				langValue = language // fallback to search language
			}

			_, err := s.queries.UpsertIssue(ctx, database.UpsertIssueParams{
				GithubID:     int64(issue.Number), // GitHub issue global ID — we use number + repo as unique key via github_id
				GithubNumber: int32(issue.Number),
				RepoOwner:    issue.RepoOwner,
				RepoName:     issue.RepoName,
				Title:        issue.Title,
				Url:          issue.URL,
				Language:     pgtype.Text{String: langValue, Valid: langValue != ""},
				Difficulty:   pgtype.Text{String: difficulty, Valid: true},
				RepoStars:    issue.RepoStars,
				RepoPushedAt: pgtype.Timestamptz{Time: issue.PushedAt, Valid: !issue.PushedAt.IsZero()},
				GithubCreatedAt: pgtype.Timestamptz{Time: issue.CreatedAt, Valid: !issue.CreatedAt.IsZero()},
				Labels:       issue.Labels,
				State:        database.IssueStateOpen,
			})
			if err != nil {
				slog.Error("upsert issue failed", "url", issue.URL, "error", err)
				continue
			}
			upserted++
		}

		if !result.PageInfo.HasNextPage {
			break
		}
		cursor = &result.PageInfo.EndCursor
	}

	return upserted, skipped, nil
}

func (s *SyncService) doGraphQL(ctx context.Context, body []byte) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, graphqlEndpoint, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Content-Type", "application/json")
	if s.token != "" {
		req.Header.Set("Authorization", "Bearer "+s.token)
	}

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("github API returned %d: %s", resp.StatusCode, string(bodyBytes))
	}

	return io.ReadAll(resp.Body)
}
```

**Note on github_id:** The GraphQL search returns issue `number` which is per-repo, not globally unique. We need to use a hash or the issue URL as the unique key. Update the `UpsertIssue` call — we should derive `github_id` from a combination. However, the simplest approach is to look at the GraphQL response for a global `databaseId` field. Let the implementer add `databaseId` to the GraphQL query's Issue fragment:

In the `SearchQuery` constant in `graphql.go`, add `databaseId` to the Issue fragment:

```graphql
... on Issue {
    databaseId
    number
    title
    ...
}
```

And add `DatabaseID int64` to `ParsedIssue`, parse it from the `databaseId` field, and use it as the `GithubID` in the upsert.

**Step 2: Verify it compiles**

Run: `cd backend && go build ./internal/sync/`
Expected: No errors. (Will only compile after Task 2's sqlc generate has run.)

**Step 3: Commit**

```bash
git add backend/internal/sync/sync.go
git commit -m "feat: add SyncService with language sync and GraphQL integration"
```

---

### Task 7: Stale Checker Logic

**Files:**
- Create: `backend/internal/sync/stale.go`

**Step 1: Write the stale checker**

Create `backend/internal/sync/stale.go`:

```go
package sync

import (
	"context"
	"fmt"
	"log/slog"
)

const (
	staleBatchSize    = 50
	maxStalePerCycle  = 500
	degradedStaleMax  = 50
)

func (s *SyncService) checkStale(ctx context.Context) error {
	limit := int32(maxStalePerCycle)
	if s.token == "" {
		limit = int32(degradedStaleMax)
	}

	issues, err := s.queries.GetStaleIssues(ctx, limit)
	if err != nil {
		return fmt.Errorf("get stale issues: %w", err)
	}

	if len(issues) == 0 {
		slog.Info("stale check: no issues to check")
		return nil
	}

	totalClosed := 0
	totalChecked := 0

	// Process in batches.
	for i := 0; i < len(issues); i += staleBatchSize {
		end := i + staleBatchSize
		if end > len(issues) {
			end = len(issues)
		}
		batch := issues[i:end]

		urls := make([]string, len(batch))
		urlToID := make(map[string]int64, len(batch))
		for j, issue := range batch {
			urls[j] = issue.Url
			urlToID[issue.Url] = issue.ID
		}

		query := BuildStaleCheckQuery(urls)
		body := BuildGraphQLRequestBody(query, nil)
		respData, err := s.doGraphQL(ctx, body)
		if err != nil {
			slog.Error("stale check graphql failed", "error", err)
			break // stop on API failure
		}

		results, err := ParseStaleCheckResponse(respData)
		if err != nil {
			slog.Error("stale check parse failed", "error", err)
			break
		}

		checkedURLs := make(map[string]bool)
		for _, r := range results {
			checkedURLs[r.URL] = true
			id, ok := urlToID[r.URL]
			if !ok {
				continue
			}

			if r.State == "CLOSED" {
				if err := s.queries.MarkIssueClosed(ctx, id); err != nil {
					slog.Error("mark issue closed", "id", id, "error", err)
					continue
				}
				totalClosed++
			} else {
				if err := s.queries.UpdateIssueSyncedAt(ctx, id); err != nil {
					slog.Error("update synced_at", "id", id, "error", err)
				}
			}
		}

		// Update synced_at for issues that weren't in the response (possibly deleted).
		for _, issue := range batch {
			if !checkedURLs[issue.Url] {
				if err := s.queries.UpdateIssueSyncedAt(ctx, issue.ID); err != nil {
					slog.Error("update synced_at for unchecked", "id", issue.ID, "error", err)
				}
			}
		}

		totalChecked += len(batch)
		slog.Info("stale batch processed", "checked", len(batch), "closed", totalClosed)
	}

	slog.Info("stale check complete", "total_checked", totalChecked, "total_closed", totalClosed)
	return nil
}
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./internal/sync/`
Expected: No errors.

**Step 3: Commit**

```bash
git add backend/internal/sync/stale.go
git commit -m "feat: add stale issue checker with batched GraphQL lookups"
```

---

### Task 8: CLI Entry Point — make sync-issues

**Files:**
- Create: `backend/cmd/sync/main.go`
- Modify: `Makefile`

**Step 1: Create the CLI entry point**

Create `backend/cmd/sync/main.go`:

```go
package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/nishantg96/gitfable/internal/config"
	"github.com/nishantg96/gitfable/internal/database"
	isync "github.com/nishantg96/gitfable/internal/sync"
)

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})))

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
	defer cancel()

	pool, err := database.NewPool(ctx, cfg.DatabaseURL, cfg.DBPoolSize)
	if err != nil {
		slog.Error("failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	queries := database.New(pool)

	svc := isync.NewSyncService(queries, cfg.GitHubToken, cfg.SyncInterval, cfg.StaleInterval)

	slog.Info("starting one-time sync")
	if err := svc.RunOnce(ctx); err != nil {
		slog.Error("sync failed", "error", err)
		os.Exit(1)
	}

	// Log final stats.
	openCount, err := queries.CountOpenIssues(ctx)
	if err == nil {
		slog.Info("sync complete", "open_issues", openCount)
	}
}
```

**Step 2: Add Makefile targets**

Add these targets to the Makefile after the `build-backend` target section:

```makefile
sync-issues: ## Run a one-time issue sync from GitHub
	cd backend && go run ./cmd/sync

build-sync: ## Build the sync CLI binary
	cd backend && go build -o bin/sync ./cmd/sync
```

Update the `.PHONY` line at the top to include `sync-issues build-sync`.

**Step 3: Verify it compiles**

Run: `cd backend && go build ./cmd/sync/`
Expected: No errors.

**Step 4: Commit**

```bash
git add backend/cmd/sync/main.go Makefile
git commit -m "feat: add CLI entry point for on-demand issue sync"
```

---

### Task 9: Server Integration — Start SyncService on Boot

**Files:**
- Modify: `backend/cmd/server/main.go`

**Step 1: Add sync service to server startup**

In `backend/cmd/server/main.go`, add the following changes:

1. Add import: `isync "github.com/nishantg96/gitfable/internal/sync"`

2. After the seed database block (after line 99), add:

```go
// 9c. Start issue sync service.
if cfg.SyncEnabled {
    syncService := isync.NewSyncService(queries, cfg.GitHubToken, cfg.SyncInterval, cfg.StaleInterval)
    syncService.Start(ctx)
    defer syncService.Stop()
}
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./cmd/server/`
Expected: No errors.

**Step 3: Commit**

```bash
git add backend/cmd/server/main.go
git commit -m "feat: start SyncService on server boot when SYNC_ENABLED=true"
```

---

### Task 10: Update Draw Handler — Use Deduplicated Queries

**Files:**
- Modify: `backend/internal/handler/draws.go:80-168` (Draw function)

**Step 1: Update the Draw handler to use dedup queries**

In `backend/internal/handler/draws.go`, update the `Draw` method:

Replace the `CountFilteredIssues` call with `CountFilteredIssuesForUser`:

```go
issueCount, err := h.queries.CountFilteredIssuesForUser(ctx, database.CountFilteredIssuesForUserParams{
    UserID:     user.ID,
    Language:   langParam,
    Difficulty: diffParam,
})
```

Replace the `GetRandomIssue` call with `GetRandomIssueForUser`:

```go
issue, err := h.queries.GetRandomIssueForUser(ctx, database.GetRandomIssueForUserParams{
    UserID:     user.ID,
    Offset:     int32(randOffset.Int64()),
    Language:   langParam,
    Difficulty: diffParam,
})
```

**Step 2: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: No errors.

**Step 3: Commit**

```bash
git add backend/internal/handler/draws.go
git commit -m "feat: use NOT EXISTS dedup queries in draw handler"
```

---

### Task 11: Update Seed Data — Add New Columns

**Files:**
- Modify: `backend/internal/seed/seed.go`

**Step 1: Update mockIssue struct and CreateIssue calls**

Update the `mockIssue` struct to include new fields:

```go
type mockIssue struct {
	GithubID      int64
	GithubNumber  int32
	RepoOwner     string
	RepoName      string
	Title         string
	URL           string
	Language      string
	Difficulty    string
	RepoStars     int32
	Labels        []string
}
```

Update the `seedIssues` function to pass the new columns:

```go
func seedIssues(ctx context.Context, queries *database.Queries) error {
	for _, m := range mockIssues {
		_, err := queries.CreateIssue(ctx, database.CreateIssueParams{
			GithubID:        m.GithubID,
			GithubNumber:    m.GithubNumber,
			RepoOwner:       m.RepoOwner,
			RepoName:        m.RepoName,
			Title:           m.Title,
			Url:             m.URL,
			Language:        text(m.Language),
			Difficulty:      text(m.Difficulty),
			RepoStars:       m.RepoStars,
			RepoPushedAt:    pgtype.Timestamptz{},
			GithubCreatedAt: pgtype.Timestamptz{},
			Labels:          m.Labels,
			State:           database.IssueStateOpen,
		})
		if err != nil {
			return fmt.Errorf("create issue %d: %w", m.GithubID, err)
		}
	}
	return nil
}
```

Add `GithubNumber` to each mock issue entry (use the last digits of GithubID as the number, e.g., `GithubNumber: 1` for the first entry through `GithubNumber: 27` for the last).

**Step 2: Verify it compiles**

Run: `cd backend && go build ./...`
Expected: No errors.

**Step 3: Commit**

```bash
git add backend/internal/seed/seed.go
git commit -m "feat: update seed data for new issues table columns"
```

---

### Task 12: Run Full Test Suite and Verify

**Step 1: Run sqlc generate**

Run: `cd backend && sqlc generate`
Expected: No errors.

**Step 2: Run all tests**

Run: `cd backend && go test ./... -v`
Expected: All tests pass. Pay attention to:
- `internal/sync/` — difficulty and graphql tests
- `internal/service/` — existing 45 tests still pass

**Step 3: Build all binaries**

Run: `cd backend && go build ./cmd/server/ && go build ./cmd/sync/`
Expected: Both compile without errors.

**Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: address any issues from full test run"
```

---

### Task Summary

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | Schema changes — new columns + dedup index | — |
| 2 | SQL queries — upsert, stale, dedup | 1 |
| 3 | Config — add sync env vars | — |
| 4 | Difficulty scoring + tests | — |
| 5 | GraphQL client + tests | — |
| 6 | SyncService core logic | 2, 3, 4, 5 |
| 7 | Stale checker | 2, 5, 6 |
| 8 | CLI entry point + Makefile | 3, 6 |
| 9 | Server integration | 3, 6 |
| 10 | Draw handler dedup | 2 |
| 11 | Update seed data | 2 |
| 12 | Full test suite verification | All |
