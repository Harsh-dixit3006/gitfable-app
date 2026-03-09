# Issue Sync Pipeline Design

**Date:** 2026-03-07
**Status:** Approved

## Problem

GitFable currently has no issue ingestion pipeline. The `issues` table is populated only by hardcoded seed data (27 mock issues). For production, we need a robust pipeline that continuously discovers high-quality "good first issues" from GitHub and maintains a fresh pool for users to draw from.

## Requirements

1. **Freshness** — recently opened issues, not months-old stale ones
2. **Repo quality** — high-star repos with active maintainers
3. **Beginner-friendliness** — labeled `good first issue`, `help wanted`, etc.
4. **Language diversity** — coverage across 15 popular languages
5. **Draw deduplication** — users never see an issue they've already drawn
6. **Scalable** — sync is O(languages), not O(users). Supports millions of users

## Approach: GitHub GraphQL API

Chosen over REST Search API because:
- Repo metadata (stars, `pushedAt`, language) returned in the same query — no supplementary calls
- 10x more efficient stale checks via batched node lookups
- More rate limit headroom (point-based, ~110 points per cycle out of 5,000/hr)
- Better data for difficulty scoring in one pass

## Architecture

```
                    GitFable Server
  +-------------------------------------------------+
  |                                                  |
  |  Handlers         SyncService      StaleChecker  |
  |  (draws, public)  (every 6hr)     (every 12hr)  |
  |       |                |                |        |
  |       |          +-----v----------------v-----+  |
  |       |          |   GitHub GraphQL API       |  |
  |       |          |   (GITHUB_TOKEN)           |  |
  |       |          +------------+---------------+  |
  |       |                       |                  |
  |  +----v-----------------------v---------------+  |
  |  |          PostgreSQL (issues table)          |  |
  |  +--------------------------------------------+  |
  +-------------------------------------------------+

  CLI:  make sync-issues  ->  runs SyncService once, then exits
```

### Components

- **SyncService** — fetches new issues from GitHub GraphQL, upserts into `issues` table. Runs every 6 hours as a background goroutine, or on-demand via CLI.
- **Stale Checker** — batch-checks existing issues to see if they're still open. Runs every 12 hours. Marks closed ones as `closed`.
- **Handlers** — unchanged. Read from `issues` table with `NOT EXISTS` deduplication per user.

## GraphQL Queries

### Issue Fetch (per language, paginated)

```graphql
query($query: String!, $cursor: String) {
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
}
```

Search string: `label:"good first issue" language:go state:open sort:updated`

### Stale Check (batched via aliased resource lookups)

Batch ~50 issues per query using aliased `resource` lookups to check current state.

### Rate Limit Budget

- Issue fetch: 15 languages x ~3 pages avg = 45 queries x ~2 points = ~90 points
- Stale check: 500 issues / 50 per query = 10 queries x ~2 points = ~20 points
- **Total: ~110 points per cycle out of 5,000/hr (2% of budget)**

## Difficulty Scoring Algorithm

Two factors: labels and repo stars. Constants are configurable for easy tuning.

### Step 1 — Label Score (0-2)

| Labels present | Score |
|---|---|
| `good first issue`, `beginner`, `easy`, `starter`, `first-timers-only` | 0 (easiest) |
| `help wanted`, `medium`, `intermediate` | 1 |
| `advanced`, `hard`, `expert`, `complex` | 2 |
| No matching label | 1 (default) |

### Step 2 — Repo Complexity Modifier

| Repo stars | Modifier |
|---|---|
| < 1,000 | -1 (simpler codebase) |
| 1,000 - 50,000 | 0 (neutral) |
| > 50,000 | +1 (large codebase) |

### Step 3 — Final Difficulty

```
raw = label_score + repo_modifier
clamp raw to [0, 2]

0 -> Beginner
1 -> Intermediate
2 -> Advanced
```

## Repo Quality Filters

- Minimum 50 stars
- Repo pushed within the last 90 days

## Draw Deduplication

Uses `NOT EXISTS` subquery with composite index:

```sql
CREATE INDEX idx_draws_user_issue ON draws(user_id, issue_id);
```

```sql
SELECT * FROM issues
WHERE state = 'open'
  AND (language = $1 OR $1 IS NULL)
  AND (difficulty = $2 OR $2 IS NULL)
  AND NOT EXISTS (
    SELECT 1 FROM draws d WHERE d.issue_id = issues.id AND d.user_id = $3
  )
OFFSET $4 LIMIT 1;
```

Performance: per-user subquery returns ~1,000 rows max (3 draws/day x 1 year). Index-only scan. Scales to millions of users — each query touches only that user's draw history.

## Sync Pipeline Flow

### Full Sync (every 6hr or CLI)

1. For each of 15 languages:
   - Query GraphQL search API
   - Paginate up to 1,000 results
   - Filter: stars >= 50, repo pushed in last 90 days
   - Score difficulty
   - Upsert into issues table (`ON CONFLICT github_id`)
   - Sleep 2s between languages (respect rate limits)

### Stale Check (every 12hr)

1. Select open issues ordered by `last_synced_at ASC` (oldest checked first)
2. Batch 50 at a time
3. Query GraphQL for current state
4. Mark closed ones as `closed`
5. Update `last_synced_at`
6. Stop after 500 issues or rate limit budget exhausted

### Upsert Behavior

- New issue: insert with scored difficulty
- Existing issue: update `title`, `repo_stars`, `labels`, `repo_pushed_at`, `last_synced_at`, re-score difficulty

## Database Changes

Added directly to `001_initial.up.sql` (not live yet):

```sql
-- New columns on issues table
github_number INTEGER NOT NULL DEFAULT 0,
repo_pushed_at TIMESTAMPTZ,
github_created_at TIMESTAMPTZ,
last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

## Graceful Degradation (no GITHUB_TOKEN)

- Sync runs with 2 languages per cycle instead of 15
- Stale check limited to 50 issues per cycle
- Logs a warning on startup recommending `GITHUB_TOKEN`

## Languages Supported

| Tier | Languages |
|------|-----------|
| High demand | JavaScript, TypeScript, Python, Go, Rust, Java |
| Mid demand | C++, C#, Ruby, PHP, Swift |
| Emerging | Kotlin, Dart, Scala, Elixir |

## Code Structure

```
backend/
  internal/
    sync/
      sync.go          # SyncService struct, Start(), RunOnce(), Stop()
      graphql.go       # GraphQL query construction and response parsing
      difficulty.go    # Scoring algorithm with configurable constants
      stale.go         # Stale checker logic
  cmd/
    sync/
      main.go          # CLI entry point: make sync-issues
```

### Key Interface

```go
type SyncService struct {
    queries       *database.Queries
    httpClient    *http.Client
    token         string           // GITHUB_TOKEN, may be empty
    languages     []string
    interval      time.Duration    // 6hr default
    staleInterval time.Duration    // 12hr default
}

func (s *SyncService) Start(ctx context.Context)   // background goroutines
func (s *SyncService) RunOnce(ctx context.Context)  // full sync + stale check
func (s *SyncService) Stop()
```

### Integration Points

- `cmd/server/main.go` — starts SyncService alongside the HTTP server
- `cmd/sync/main.go` — calls RunOnce() then exits
- `Makefile` — adds `sync-issues` and `dev-sync` targets
- `config.go` — adds `GITHUB_TOKEN`, `SYNC_INTERVAL`, `STALE_INTERVAL` env vars

## Config Additions

| Env var | Default | Description |
|---------|---------|-------------|
| `GITHUB_TOKEN` | (empty) | GitHub personal access token for API access |
| `SYNC_INTERVAL` | `6h` | How often the full sync runs |
| `STALE_INTERVAL` | `12h` | How often the stale checker runs |
| `SYNC_ENABLED` | `true` | Disable background sync (useful for tests) |
