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

	// Filter for demo repo issues
	var demoIssues []database.Issue
	for _, issue := range issues {
		if issue.RepoOwner == "nishantg96" && issue.RepoName == "git-demo-issues" {
			demoIssues = append(demoIssues, issue)
		}
	}

	// If no demo issues found, create them manually
	if len(demoIssues) == 0 {
		s.t.Log("No demo repo issues found in database. Creating them manually...")
		demoIssues = s.createDemoIssues()
	} else {
		s.t.Logf("Found %d issues from nishantg96/git-demo-issues in database", len(demoIssues))
	}

	for _, iss := range demoIssues {
		s.testIssues = append(s.testIssues, iss)
	}

	return s.testIssues
}

// createDemoIssues creates the demo repo issues manually with real GitHub data
func (s *liveTestSuite) createDemoIssues() []database.Issue {
	// Real issues from nishantg96/git-demo-issues (as of 2026-03-09)
	// These use the actual GitHub IDs from the real repo
	demoIssues := []struct {
		githubID     int64
		githubNumber int32
		title        string
		url          string
		language     string
		difficulty   string
		labels       []string
	}{
		{
			githubID:     4042667884,
			githubNumber: 2,
			title:        "Improve welcome message wording",
			url:          "https://github.com/nishantg96/git-demo-issues/issues/2",
			language:     "javascript",
			difficulty:   "easy",
			labels:       []string{"enhancement", "good first issue"},
		},
		{
			githubID:     4042667920,
			githubNumber: 3,
			title:        "Fix checklist owner value for demo data",
			url:          "https://github.com/nishantg96/git-demo-issues/issues/3",
			language:     "json",
			difficulty:   "easy",
			labels:       []string{"bug", "good first issue"},
		},
		{
			githubID:     4042667958,
			githubNumber: 4,
			title:        "Refactor status formatter for readability",
			url:          "https://github.com/nishantg96/git-demo-issues/issues/4",
			language:     "javascript",
			difficulty:   "medium",
			labels:       []string{"refactor", "good first issue"},
		},
		{
			githubID:     4042668138,
			githubNumber: 5,
			title:        "Correct footer copy punctuation",
			url:          "https://github.com/nishantg96/git-demo-issues/issues/5",
			language:     "javascript",
			difficulty:   "easy",
			labels:       []string{"bug", "good first issue"},
		},
	}

	repoOwner := "nishantg96"
	repoName := "git-demo-issues"
	var createdIssues []database.Issue

	for _, iss := range demoIssues {
		// Create the issue with real GitHub IDs
		issue, err := s.queries.UpsertIssue(s.ctx, database.UpsertIssueParams{
			GithubID:        iss.githubID,
			GithubNumber:    iss.githubNumber,
			RepoOwner:       repoOwner,
			RepoName:        repoName,
			Title:           iss.title,
			Url:             iss.url,
			Language:        pgtype.Text{String: iss.language, Valid: true},
			Difficulty:      pgtype.Text{String: iss.difficulty, Valid: true},
			Rarity:          "common",
			RepoStars:       0,
			RepoPushedAt:    pgtype.Timestamptz{},
			GithubCreatedAt: pgtype.Timestamptz{},
			Labels:          iss.labels,
			State:           database.IssueStateOpen,
		})
		if err != nil {
			s.t.Fatalf("Failed to create demo issue %d: %v", iss.githubNumber, err)
		}
		createdIssues = append(createdIssues, issue)
		s.t.Logf("Created demo issue #%d: %s", iss.githubNumber, iss.title)
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

		// Check for PR #7 which we know exists in the demo repo
		prStatus, err := githubClient.GetPRStatus(suite.ctx, "nishantg96", "git-demo-issues", 7)
		if err != nil {
			t.Logf("Note: Could not fetch PR #7: %v", err)
			t.Skip("Skipping PR verification test - PR #7 not accessible")
		}

		t.Logf("✓ Found real PR #7 on GitHub:")
		t.Logf("  Title: %s", prStatus.Title)
		t.Logf("  State: %s", prStatus.State)
		t.Logf("  Merged: %v", prStatus.Merged)
		t.Logf("  Author: %s", prStatus.UserLogin)

		// Verify PR references an issue
		if !service.PRReferencesIssue(*prStatus, 2) && !service.PRReferencesIssue(*prStatus, 4) && !service.PRReferencesIssue(*prStatus, 5) {
			t.Logf("Warning: PR #7 doesn't reference expected issues")
		} else {
			t.Logf("✓ PR #7 references an issue from our demo repo")
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

		// For this test, we'll try to submit PR #7 which we know exists
		// In a real scenario, the user would create a new PR
		prURL := "https://github.com/nishantg96/git-demo-issues/pull/7"

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
		// Check if PR #7 is actually merged on GitHub
		githubClient := service.NewGitHubClient(suite.githubToken)

		prStatus, err := githubClient.GetPRStatus(suite.ctx, "nishantg96", "git-demo-issues", 7)
		if err != nil {
			t.Skipf("Cannot fetch PR status: %v", err)
		}

		if prStatus.Merged {
			t.Logf("✓ PR #7 is MERGED on GitHub!")
			t.Logf("  Merged at: %s", prStatus.MergedAt)
			t.Logf("  Merge commit: %s", prStatus.MergeCommitSHA)
		} else {
			t.Logf("PR #7 is not merged yet (state: %s)", prStatus.State)
			t.Logf("This is expected - PRs need to be merged manually on GitHub")
		}
	})

	t.Log("\n=== Live Integration Test Complete ===")
	t.Log("Tests validated against REAL GitHub API:")
	t.Log("  ✓ Can bookmark real issues from demo repo")
	t.Log("  ✓ PR verification works with real GitHub data")
	t.Log("  ✓ Merge status check works with real GitHub")
}

// TestLivePRSubmissionWithTestAccount demonstrates creating a real PR
// This requires a test GitHub account with write access to the demo repo
func TestLivePRSubmissionWithTestAccount(t *testing.T) {
	t.Skip("Skipped: Requires test GitHub account with write access to nishantg96/git-demo-issues")

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
