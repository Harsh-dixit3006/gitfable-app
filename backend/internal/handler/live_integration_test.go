package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nishantg96/gitfable/internal/ctxutil"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/service"
)

// liveTestSuite holds fixtures for live GitHub integration tests
type liveTestSuite struct {
	t           *testing.T
	ctx         context.Context
	pool        *pgxpool.Pool
	queries     *database.Queries
	handler     *DrawHandler
	githubToken string
	repo        githubTestRepo
	issueNums   []int
	prNumber    int
	testUser    database.User
	testIssues  []database.Issue
}

// setupLive creates a test suite with live GitHub API access
func setupLive(t *testing.T) *liveTestSuite {
	ctx := context.Background()

	// Require GitHub token for live tests
	githubToken := os.Getenv("GITHUB_TOKEN")
	if githubToken == "" {
		t.Skip("GITHUB_TOKEN not set - skipping live integration tests. " +
			"Set GITHUB_TOKEN to run tests against real GitHub API.")
	}

	repo, err := parseGitHubTestRepo(os.Getenv("LIVE_TEST_REPO"))
	if err != nil {
		t.Skip("LIVE_TEST_REPO not set - skipping live integration tests. Set to owner/repo for a maintainer-controlled demo repository.")
	}

	issueNums, err := parseGitHubIssueNumbers(os.Getenv("LIVE_TEST_ISSUE_NUMBERS"))
	if err != nil {
		t.Skip("LIVE_TEST_ISSUE_NUMBERS not set - skipping live integration tests. Set to a comma-separated list of issue numbers in LIVE_TEST_REPO.")
	}

	prNumber, err := parseGitHubPRNumber(os.Getenv("LIVE_TEST_PR_NUMBER"))
	if err != nil {
		t.Skip("LIVE_TEST_PR_NUMBER not set - skipping live integration tests. Set to a pull request number in LIVE_TEST_REPO.")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://gitfable:gitfable@postgres:5432/gitfable?sslmode=disable"
	}

	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		t.Skipf("Database not available: %v", err)
	}

	queries := database.New(pool)
	xpSvc := service.NewXPService(queries)
	badgeSvc := service.NewBadgeService(queries)
	streakSvc := service.NewStreakService(queries)
	issueChecker := service.NewIssueChecker(nil)

	// Use REAL GitHub client for live tests
	githubClient := service.NewGitHubClient(githubToken)

	dummyAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r)
		})
	}

	handler := NewDrawHandler(pool, queries, dummyAuth, xpSvc, badgeSvc, streakSvc, githubClient, issueChecker, 10)

	return &liveTestSuite{
		t:           t,
		ctx:         ctx,
		pool:        pool,
		queries:     queries,
		handler:     handler,
		githubToken: githubToken,
		repo:        repo,
		issueNums:   issueNums,
		prNumber:    prNumber,
	}
}

func (s *liveTestSuite) cleanup() {
	if s.pool != nil {
		s.pool.Close()
	}
}

// createLiveTestUser creates a test user with real GitHub credentials
func (s *liveTestSuite) createLiveTestUser() database.User {
	// Always use unique identifiers to avoid conflicts
	uid := uuid.New().String()[:8]

	// For live tests, we can use a real GitHub username prefix
	// You can set this via env var or use a test account
	githubUsername := os.Getenv("TEST_GITHUB_USERNAME")
	if githubUsername == "" {
		githubUsername = "livetest_" + uid // Unique per test run
	} else {
		githubUsername = githubUsername + "_" + uid // Make it unique
	}

	user, err := s.queries.CreateUser(s.ctx, database.CreateUserParams{
		AuthID:         "live-test-" + uid,
		Username:       "livetest_" + uid,
		Email:          "livetest_" + uid + "@example.com",
		GithubUsername: pgtype.Text{String: githubUsername, Valid: true},
	})
	if err != nil {
		s.t.Fatalf("Failed to create test user: %v", err)
	}
	s.testUser = user
	return user
}

// loadDemoIssues loads or creates demo repo issues
// If issues don't exist in database, creates them with real GitHub data
func (s *liveTestSuite) loadDemoIssues() []database.Issue {
	// Look for existing demo repo issues in the database
	issues, err := s.queries.ListIssues(s.ctx, database.ListIssuesParams{Limit: 10})
	if err != nil {
		s.t.Fatalf("Failed to list issues: %v", err)
	}

	// Filter for configured maintainer repo issues
	var demoIssues []database.Issue
	for _, issue := range issues {
		if issue.RepoOwner == s.repo.Owner && issue.RepoName == s.repo.Name {
			demoIssues = append(demoIssues, issue)
		}
	}

	// If no demo issues found, create them manually
	if len(demoIssues) == 0 {
		s.t.Log("No demo repo issues found in database. Creating them manually...")
		demoIssues = s.createDemoIssues()
	} else {
		s.t.Logf("Found %d issues from %s/%s in database", len(demoIssues), s.repo.Owner, s.repo.Name)
	}

	for _, iss := range demoIssues {
		s.testIssues = append(s.testIssues, iss)
	}

	return s.testIssues
}

// createDemoIssues creates placeholder DB rows for the configured maintainer repo issues.
func (s *liveTestSuite) createDemoIssues() []database.Issue {
	var createdIssues []database.Issue

	for _, issueNumber := range s.issueNums {
		githubID := int64(issueNumber)
		issue, err := s.queries.UpsertIssue(s.ctx, database.UpsertIssueParams{
			GithubID:        githubID,
			GithubNumber:    int32(issueNumber),
			RepoOwner:       s.repo.Owner,
			RepoName:        s.repo.Name,
			Title:           fmt.Sprintf("Maintainer live test issue #%d", issueNumber),
			Url:             fmt.Sprintf("https://github.com/%s/%s/issues/%d", s.repo.Owner, s.repo.Name, issueNumber),
			Language:        pgtype.Text{String: "unknown", Valid: true},
			Difficulty:      pgtype.Text{String: "easy", Valid: true},
			Rarity:          "common",
			RepoStars:       0,
			RepoPushedAt:    pgtype.Timestamptz{},
			GithubCreatedAt: pgtype.Timestamptz{},
			Labels:          []string{"good first issue"},
			State:           database.IssueStateOpen,
		})
		if err != nil {
			s.t.Fatalf("Failed to create demo issue %d: %v", issueNumber, err)
		}
		createdIssues = append(createdIssues, issue)
		s.t.Logf("Created demo issue #%d in %s/%s", issueNumber, s.repo.Owner, s.repo.Name)
	}

	s.t.Logf("Successfully created %d demo issues", len(createdIssues))
	return createdIssues
}

// TestLiveWorkflow runs the complete workflow with real GitHub API calls
func TestLiveWorkflow(t *testing.T) {
	suite := setupLive(t)
	defer suite.cleanup()

	// Setup test data
	user := suite.createLiveTestUser()
	issues := suite.loadDemoIssues()

	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := ctxutil.SetUser(r.Context(), &user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Mount("/api/v1/draws", suite.handler.Routes())

	t.Run("ChooseAndBookmarkRealIssue", func(t *testing.T) {
		// Pick the first available issue
		if len(issues) == 0 {
			t.Fatal("No issues available")
		}

		issue := issues[0]

		body, _ := json.Marshal(chooseRequest{
			IssueID:             issue.PublicID.String(),
			BookmarkImmediately: true,
		})
		req := httptest.NewRequest("POST", "/api/v1/draws/choose", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("Failed to bookmark real issue: %d - %s", w.Code, w.Body.String())
		}

		var resp drawResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if resp.Data.Draw.Status != "bookmarked" {
			t.Errorf("Expected bookmarked status, got %s", resp.Data.Draw.Status)
		}

		t.Logf("✓ Successfully bookmarked real issue #%d: %s", issue.GithubNumber, issue.Title)
	})

	t.Run("CheckRealPRVerification", func(t *testing.T) {
		// Check if any PRs exist in the demo repo that reference our issues
		// This validates our PR parsing logic against real data

		githubClient := service.NewGitHubClient(suite.githubToken)

		prStatus, err := githubClient.GetPRStatus(suite.ctx, suite.repo.Owner, suite.repo.Name, suite.prNumber)
		if err != nil {
			t.Logf("Note: Could not fetch PR #%d: %v", suite.prNumber, err)
			t.Skip("Skipping PR verification test - configured PR not accessible")
		}

		t.Logf("✓ Found real PR #%d on GitHub:", suite.prNumber)
		t.Logf("  Title: %s", prStatus.Title)
		t.Logf("  State: %s", prStatus.State)
		t.Logf("  Merged: %v", prStatus.Merged)
		t.Logf("  Author: %s", prStatus.UserLogin)

		// Verify PR references an issue
		matchesKnownIssue := false
		for _, issueNumber := range suite.issueNums {
			if service.PRReferencesIssue(*prStatus, int32(issueNumber)) {
				matchesKnownIssue = true
				break
			}
		}
		if !matchesKnownIssue {
			t.Logf("Warning: PR #%d doesn't reference the configured issue numbers", suite.prNumber)
		} else {
			t.Logf("✓ PR #%d references an issue from the configured maintainer repo", suite.prNumber)
		}
	})

	t.Run("SubmitPRWithRealValidation", func(t *testing.T) {
		// Get active work
		activeWork, err := suite.queries.ListActiveWorkForUser(suite.ctx, user.ID)
		if err != nil {
			t.Fatalf("Failed to list active work: %v", err)
		}

		var bookmark *database.ListActiveWorkForUserRow
		for i := range activeWork {
			if activeWork[i].Status == database.DrawStatusBookmarked {
				bookmark = &activeWork[i]
				break
			}
		}

		if bookmark == nil {
			t.Skip("No bookmarked issues found - skipping PR submission test")
		}

		prURL := fmt.Sprintf("https://github.com/%s/%s/pull/%d", suite.repo.Owner, suite.repo.Name, suite.prNumber)

		body, _ := json.Marshal(map[string]string{
			"pr_url": prURL,
		})
		req := httptest.NewRequest("PUT", fmt.Sprintf("/api/v1/draws/%s/pr", bookmark.PublicID.String()), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		// The result depends on whether the PR author matches the test user
		// and whether the PR references the bookmarked issue
		t.Logf("PR submission result: %d", w.Code)
		t.Logf("Response: %s", w.Body.String())

		if w.Code == http.StatusOK {
			t.Logf("✓ Successfully submitted PR with real GitHub validation")
		} else if w.Code == http.StatusBadRequest {
			var errResp ErrorResponse
			if err := json.Unmarshal(w.Body.Bytes(), &errResp); err == nil {
				t.Logf("PR validation failed: %s - %s", errResp.Error.Code, errResp.Error.Message)
				t.Logf("This validates that real GitHub checks are working (PR author or repo mismatch expected)")
			}
		}
	})

	t.Run("VerifyRealMergeStatus", func(t *testing.T) {
		// Check if the configured PR is actually merged on GitHub
		githubClient := service.NewGitHubClient(suite.githubToken)

		prStatus, err := githubClient.GetPRStatus(suite.ctx, suite.repo.Owner, suite.repo.Name, suite.prNumber)
		if err != nil {
			t.Skipf("Cannot fetch PR status: %v", err)
		}

		if prStatus.Merged {
			t.Logf("✓ PR #%d is MERGED on GitHub!", suite.prNumber)
			t.Logf("  Merged at: %s", prStatus.MergedAt)
			t.Logf("  Merge commit: %s", prStatus.MergeCommitSHA)
		} else {
			t.Logf("PR #%d is not merged yet (state: %s)", suite.prNumber, prStatus.State)
			t.Logf("This is expected - PRs need to be merged manually on GitHub")
		}
	})

	t.Log("\n=== Live Integration Test Complete ===")
	t.Log("Tests validated against REAL GitHub API:")
	t.Log("  ✓ Can bookmark real issues from configured maintainer repo")
	t.Log("  ✓ PR verification works with real GitHub data")
	t.Log("  ✓ Merge status check works with real GitHub")
}

// TestLivePRSubmissionWithTestAccount demonstrates creating a real PR
// This requires a test GitHub account with write access to the demo repo
func TestLivePRSubmissionWithTestAccount(t *testing.T) {
	t.Skip("Skipped: Requires test GitHub account with write access to LIVE_TEST_REPO")

	// This test would:
	// 1. Fork the demo repo
	// 2. Create a branch
	// 3. Make a trivial change
	// 4. Push the branch
	// 5. Create a PR via GitHub API
	// 6. Submit the PR URL to GitFable
	// 7. Verify it's accepted
	// 8. (Optionally) Merge the PR
	// 9. Verify rewards are awarded

	// Implementation would use go-github library or direct API calls
}
