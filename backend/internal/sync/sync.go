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

const (
	graphqlEndpoint = "https://api.github.com/graphql"
	maxRetries      = 3
	retryBaseDelay  = 30 * time.Second // GitHub recommends waiting "a few minutes"
	interPageDelay  = 1 * time.Second
	interLangDelay  = 3 * time.Second
)

// DefaultLanguages is the full set of languages to sync when a GitHub token is available.
var DefaultLanguages = []string{
	"JavaScript", "TypeScript", "Python", "Go", "Rust", "Java",
	"C++", "C#", "Ruby", "PHP", "Swift",
	"Kotlin", "Dart", "Scala", "Elixir",
}

// DegradedLanguages is the reduced set used when no GitHub token is configured.
var DegradedLanguages = []string{"JavaScript", "Python"}

// SyncService periodically fetches "good first issue" issues from GitHub's
// GraphQL API and upserts them into the database. It also runs a stale checker
// that marks closed issues.
type SyncService struct {
	queries       *database.Queries
	httpClient    *http.Client
	token         string
	languages     []string
	interval      time.Duration
	staleInterval time.Duration
	stopCh        chan struct{}
}

// NewSyncService creates a new SyncService. If token is empty, the service
// runs in degraded mode with fewer languages.
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

// Start begins the sync and stale-check background loops.
func (s *SyncService) Start(ctx context.Context) {
	go s.syncLoop(ctx)
	go s.staleLoop(ctx)
	slog.Info("sync service started", "languages", len(s.languages), "interval", s.interval, "stale_interval", s.staleInterval)
}

// Stop signals both background loops to exit.
func (s *SyncService) Stop() {
	close(s.stopCh)
}

// RunOnce performs a single full sync followed by a stale check.
// Useful for CLI one-shot mode.
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
			continue
		}
		totalUpserted += upserted
		totalSkipped += skipped
		slog.Info("synced language", "language", lang, "upserted", upserted, "skipped", skipped)

		// Rate-limit between languages to avoid GitHub API abuse.
		select {
		case <-time.After(interLangDelay):
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
		variables := map[string]any{"query": searchQuery}
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
			if IsClaimed(issue.Labels, issue.HasOpenPR, issue.AssigneeCount, issue.Comments) {
				skipped++
				continue
			}

			difficulty := ScoreDifficulty(issue.Labels, issue.RepoStars)
			rarity := ScoreRarity(issue.RepoStars)
			langValue := issue.Language
			if langValue == "" {
				langValue = language
			}

			_, dbErr := s.queries.UpsertIssue(ctx, database.UpsertIssueParams{
				GithubID:        issue.DatabaseID,
				GithubNumber:    int32(issue.Number),
				RepoOwner:       issue.RepoOwner,
				RepoName:        issue.RepoName,
				Title:           issue.Title,
				Url:             issue.URL,
				Language:        pgtype.Text{String: langValue, Valid: langValue != ""},
				Difficulty:      pgtype.Text{String: difficulty, Valid: true},
				Rarity:          rarity,
				RepoStars:       issue.RepoStars,
				RepoPushedAt:    pgtype.Timestamptz{Time: issue.PushedAt, Valid: !issue.PushedAt.IsZero()},
				GithubCreatedAt: pgtype.Timestamptz{Time: issue.CreatedAt, Valid: !issue.CreatedAt.IsZero()},
				Labels:          issue.Labels,
				State:           database.IssueStateOpen,
			})
			if dbErr != nil {
				slog.Error("upsert issue failed", "url", issue.URL, "error", dbErr)
				continue
			}
			upserted++
		}

		if !result.PageInfo.HasNextPage {
			break
		}
		cursor = &result.PageInfo.EndCursor

		// Pause between pages to avoid secondary rate limits.
		select {
		case <-time.After(interPageDelay):
		case <-ctx.Done():
			return upserted, skipped, ctx.Err()
		}
	}

	return upserted, skipped, nil
}

// checkStale fetches the oldest-synced open issues and verifies their state
// against the GitHub API. Closed issues are marked accordingly in the database.
func (s *SyncService) checkStale(ctx context.Context) error {
	const batchSize = 50

	issues, err := s.queries.GetStaleIssues(ctx, batchSize)
	if err != nil {
		return fmt.Errorf("get stale issues: %w", err)
	}
	if len(issues) == 0 {
		slog.Info("no stale issues to check")
		return nil
	}

	// Build URL list and a lookup map from URL -> issue ID.
	urls := make([]string, len(issues))
	urlToID := make(map[string]int64, len(issues))
	for i, iss := range issues {
		urls[i] = iss.Url
		urlToID[iss.Url] = iss.ID
	}

	query := BuildStaleCheckQuery(urls)
	body := BuildGraphQLRequestBody(query, nil)
	respData, err := s.doGraphQL(ctx, body)
	if err != nil {
		return fmt.Errorf("stale check graphql: %w", err)
	}

	results, err := ParseStaleCheckResponse(respData)
	if err != nil {
		return fmt.Errorf("parse stale response: %w", err)
	}

	closed := 0
	for _, r := range results {
		id, ok := urlToID[r.URL]
		if !ok {
			continue
		}
		if r.State == "CLOSED" || r.State == "MERGED" {
			if err := s.queries.MarkIssueClosed(ctx, id); err != nil {
				slog.Error("mark issue closed failed", "id", id, "url", r.URL, "error", err)
				continue
			}
			closed++
		} else {
			if err := s.queries.UpdateIssueSyncedAt(ctx, id); err != nil {
				slog.Error("update synced_at failed", "id", id, "url", r.URL, "error", err)
			}
		}
	}

	slog.Info("stale check complete", "checked", len(issues), "closed", closed)
	return nil
}

func (s *SyncService) doGraphQL(ctx context.Context, body []byte) ([]byte, error) {
	for attempt := range maxRetries {
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

		if resp.StatusCode == http.StatusOK {
			data, err := io.ReadAll(resp.Body)
			resp.Body.Close()
			return data, err
		}

		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		// Retry on 403 (secondary rate limit) with exponential backoff.
		if resp.StatusCode == http.StatusForbidden && attempt < maxRetries-1 {
			delay := retryBaseDelay * time.Duration(1<<attempt)
			slog.Warn("rate limited, backing off", "attempt", attempt+1, "delay", delay, "status", resp.StatusCode)
			select {
			case <-time.After(delay):
				continue
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}

		return nil, fmt.Errorf("github API returned %d: %s", resp.StatusCode, string(respBody))
	}
	return nil, fmt.Errorf("exhausted retries")
}
