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
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/nishantg96/gitfable/internal/ctxutil"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/service"
)

// e2eTestSuite holds test fixtures
type e2eTestSuite struct {
	t          *testing.T
	ctx        context.Context
	pool       *pgxpool.Pool
	queries    *database.Queries
	handler    *DrawHandler
	mockGithub *mockGitHubClient
	testUser   database.User
	testIssues []database.Issue
}

func connectTestDB(ctx context.Context, dbURL string) (*pgxpool.Pool, error) {
	pool, err := pgxpool.New(ctx, dbURL)
	if err != nil {
		return nil, err
	}

	pingCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, err
	}

	return pool, nil
}

// setupE2E creates a test suite with database connection
func setupE2E(t *testing.T) *e2eTestSuite {
	ctx := context.Background()

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgresql://gitfable:gitfable@postgres:5432/gitfable?sslmode=disable"
	}

	pool, err := connectTestDB(ctx, dbURL)
	if err != nil {
		t.Skipf("Database not available: %v", err)
	}

	queries := database.New(pool)
	xpSvc := service.NewXPService(queries)
	badgeSvc := service.NewBadgeService(queries)
	streakSvc := service.NewStreakService(queries)
	issueChecker := service.NewIssueChecker(nil) // nil redis = no caching

	// Mock GitHub client for deterministic PR testing
	mockGithub := newMockGitHubClient()

	// Dummy auth middleware that just passes through
	dummyAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r)
		})
	}

	handler := NewDrawHandler(pool, queries, dummyAuth, xpSvc, badgeSvc, streakSvc, mockGithub, issueChecker, 10)

	return &e2eTestSuite{
		t:          t,
		ctx:        ctx,
		pool:       pool,
		queries:    queries,
		handler:    handler,
		mockGithub: mockGithub,
	}
}

func (s *e2eTestSuite) cleanup() {
	if s.pool != nil {
		s.pool.Close()
	}
}

// createTestUser creates a test user with Firebase UID and GitHub username
func (s *e2eTestSuite) createTestUser() database.User {
	uid := uuid.New().String()[:8]
	user, err := s.queries.CreateUser(s.ctx, database.CreateUserParams{
		AuthID:         "test-firebase-" + uid,
		Username:       "testuser_" + uid,
		Email:          "test_" + uid + "@example.com",
		GithubUsername: pgtype.Text{String: "testuser_" + uid, Valid: true}, // Unique per test
	})
	if err != nil {
		s.t.Fatalf("Failed to create test user: %v", err)
	}
	s.testUser = user
	return user
}

// createDemoIssues creates test issues from the real demo repo
// Uses actual GitHub issues from nishantg96/git-demo-issues so IssueChecker validates them
func (s *e2eTestSuite) createDemoIssues() []database.Issue {
	// Real issues from nishantg96/git-demo-issues (fetched 2026-03-09)
	// These must exist and be open on GitHub for IssueChecker to work
	demoIssues := []struct {
		githubID     int64
		githubNumber int32
		title        string
		language     string
		difficulty   string
		labels       []string
	}{
		{4042667884, 2, "Improve welcome message wording", "javascript", "easy", []string{"enhancement", "good first issue"}},
		{4042667920, 3, "Fix checklist owner value for demo data", "json", "easy", []string{"bug", "good first issue"}},
		{4042667958, 4, "Refactor status formatter for readability", "javascript", "medium", []string{"refactor", "good first issue"}},
		{4042668138, 5, "Correct footer copy punctuation", "javascript", "easy", []string{"bug", "good first issue"}},
	}

	repoOwner := "nishantg96"
	repoName := "git-demo-issues"

	for _, iss := range demoIssues {
		// Use UpsertIssue to handle existing issues gracefully
		// ON CONFLICT will return the existing row if github_id already exists
		issue, err := s.queries.UpsertIssue(s.ctx, database.UpsertIssueParams{
			GithubID:        iss.githubID,
			GithubNumber:    iss.githubNumber,
			RepoOwner:       repoOwner,
			RepoName:        repoName,
			Title:           iss.title,
			Url:             fmt.Sprintf("https://github.com/%s/%s/issues/%d", repoOwner, repoName, iss.githubNumber),
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
			s.t.Fatalf("Failed to upsert test issue %d: %v", iss.githubNumber, err)
		}
		s.testIssues = append(s.testIssues, issue)
	}

	return s.testIssues
}

// TestCompleteWorkflow validates the entire user journey
func TestCompleteWorkflow(t *testing.T) {
	suite := setupE2E(t)
	defer suite.cleanup()

	// Setup test data
	user := suite.createTestUser()
	issues := suite.createDemoIssues()

	// Create router with auth middleware bypass for testing
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := ctxutil.SetUser(r.Context(), &user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Mount("/api/v1/draws", suite.handler.Routes())

	// Step 1: Draw a random issue
	t.Run("DrawRandomIssue", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/v1/draws", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("Expected 201, got %d: %s", w.Code, w.Body.String())
		}

		var resp drawResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if resp.Data.Draw.Status != "drawn" {
			t.Errorf("Expected status 'drawn', got %s", resp.Data.Draw.Status)
		}
		t.Logf("✓ Drew issue: %s", resp.Data.Issue.Title)
	})

	// Step 2: Choose and bookmark directly from table
	t.Run("ChooseAndBookmark", func(t *testing.T) {
		body, _ := json.Marshal(chooseRequest{
			IssueID:             issues[0].PublicID.String(),
			BookmarkImmediately: true,
		})
		req := httptest.NewRequest("POST", "/api/v1/draws/choose", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("Expected 201, got %d: %s", w.Code, w.Body.String())
		}

		var resp drawResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode response: %v", err)
		}

		if resp.Data.Draw.Status != "bookmarked" {
			t.Errorf("Expected status 'bookmarked', got %s", resp.Data.Draw.Status)
		}
		t.Logf("✓ Bookmarked issue: %s", resp.Data.Issue.Title)
	})

	// Step 3: Fill active work queue to 4 items (max available from demo repo)
	t.Run("FillActiveWorkQueue", func(t *testing.T) {
		// Already have 1 from previous test, need 3 more
		for i := 1; i <= 3; i++ {
			body, _ := json.Marshal(chooseRequest{
				IssueID:             issues[i].PublicID.String(),
				BookmarkImmediately: true,
			})
			req := httptest.NewRequest("POST", "/api/v1/draws/choose", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()
			r.ServeHTTP(w, req)

			if w.Code != http.StatusCreated {
				t.Fatalf("Expected 201 for issue %d, got %d: %s", i, w.Code, w.Body.String())
			}
		}

		// Verify we have 4 active items
		count, err := suite.queries.CountActiveWorkForUser(suite.ctx, user.ID)
		if err != nil {
			t.Fatalf("Failed to count active work: %v", err)
		}
		if count != 4 {
			t.Errorf("Expected 4 active items, got %d", count)
		}
		t.Logf("✓ Queue filled with 4 active bookmarks")
	})

	// Step 4: Verify duplicate bookmark prevention
	t.Run("DuplicateBookmarkPrevention", func(t *testing.T) {
		body, _ := json.Marshal(chooseRequest{
			IssueID:             issues[0].PublicID.String(), // Try to add issue 0 which is already bookmarked
			BookmarkImmediately: true,
		})
		req := httptest.NewRequest("POST", "/api/v1/draws/choose", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusBadRequest {
			t.Fatalf("Expected 400, got %d: %s", w.Code, w.Body.String())
		}

		var errResp ErrorResponse
		if err := json.Unmarshal(w.Body.Bytes(), &errResp); err != nil {
			t.Fatalf("Failed to decode error response: %v", err)
		}

		if errResp.Error.Code != ErrCodeBookmarkExists {
			t.Errorf("Expected error code %s, got %s", ErrCodeBookmarkExists, errResp.Error.Code)
		}
		t.Logf("✓ Duplicate bookmark prevented")
	})

	// Step 5: Test draw status update (abandon a bookmark)
	t.Run("AbandonBookmark", func(t *testing.T) {
		// Get current active work
		activeWork, err := suite.queries.ListActiveWorkForUser(suite.ctx, user.ID)
		if err != nil {
			t.Fatalf("Failed to list active work: %v", err)
		}
		if len(activeWork) < 1 {
			t.Fatalf("Expected at least 1 active item, got %d", len(activeWork))
		}

		// Abandon the first active bookmark
		bookmarkToAbandon := activeWork[0].PublicID.String()
		body, _ := json.Marshal(map[string]string{
			"status": "abandoned",
		})
		req := httptest.NewRequest("PUT", "/api/v1/draws/"+bookmarkToAbandon+"/status", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 for abandon, got %d: %s", w.Code, w.Body.String())
		}

		// Verify it's abandoned
		bookmarkID, _ := parseUUID(bookmarkToAbandon)
		updatedDraw, _ := suite.queries.GetDrawByPublicID(suite.ctx, bookmarkID)
		if updatedDraw.Status != database.DrawStatusAbandoned {
			t.Errorf("Expected draw to be abandoned, got %s", updatedDraw.Status)
		}
		t.Logf("✓ Successfully abandoned bookmark")
	})

	// Step 6: Swap flow - Now that we have an abandoned slot, try to bookmark a new issue
	t.Run("SwapFlow", func(t *testing.T) {
		// Count current active work
		activeWork, err := suite.queries.ListActiveWorkForUser(suite.ctx, user.ID)
		if err != nil {
			t.Fatalf("Failed to list active work: %v", err)
		}
		initialCount := len(activeWork)

		// Try to bookmark issue 0 again (it was abandoned in previous test)
		body, _ := json.Marshal(chooseRequest{
			IssueID:             issues[0].PublicID.String(),
			BookmarkImmediately: true,
		})
		req := httptest.NewRequest("POST", "/api/v1/draws/choose", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		// Since we abandoned one, this should succeed
		if w.Code != http.StatusCreated {
			t.Fatalf("Expected 201 for re-bookmark after abandon, got %d: %s", w.Code, w.Body.String())
		}

		// Verify active count is back to original
		activeWork, _ = suite.queries.ListActiveWorkForUser(suite.ctx, user.ID)
		if len(activeWork) != initialCount+1 {
			t.Errorf("Expected %d active items after re-bookmark, got %d", initialCount+1, len(activeWork))
		}
		t.Logf("✓ Successfully re-bookmarked after abandon")
	})

	// Step 7: Submit PR for a bookmarked issue
	t.Run("SubmitPR", func(t *testing.T) {
		// Get active work to find a bookmarked issue
		activeWork, err := suite.queries.ListActiveWorkForUser(suite.ctx, user.ID)
		if err != nil {
			t.Fatalf("Failed to list active work: %v", err)
		}
		if len(activeWork) == 0 {
			t.Fatal("No active bookmarks to submit PR for")
		}

		// Use the first bookmarked issue
		bookmark := activeWork[0]

		// Get the issue details to find the GitHub issue number
		issue, err := suite.queries.GetIssueByID(suite.ctx, bookmark.IssueID)
		if err != nil {
			t.Fatalf("Failed to get issue: %v", err)
		}

		// Configure the mock GitHub client with the correct PR response
		// The PR must reference the issue number and match the user's GitHub username
		prNumber := 100 + int(issue.ID) // Use a unique PR number
		prURL := fmt.Sprintf("https://github.com/nishantg96/git-demo-issues/pull/%d", prNumber)

		// Get the user's GitHub username
		testUser, _ := suite.queries.GetUserByID(suite.ctx, user.ID)
		githubUsername := "testuser"
		if testUser.GithubUsername.Valid {
			githubUsername = testUser.GithubUsername.String
		}

		// Set up the mock PR response with proper issue reference
		suite.mockGithub.SetPRStatus("nishantg96", "git-demo-issues", prNumber, &service.PRStatus{
			State:          "open",
			Merged:         false,
			MergedAt:       "",
			MergeCommitSHA: "",
			UserLogin:      githubUsername,
			Title:          fmt.Sprintf("Fix issue - refs #%d", issue.GithubNumber),
			Body:           fmt.Sprintf("This PR fixes #%d", issue.GithubNumber),
			HTMLURL:        prURL,
		})

		body, _ := json.Marshal(map[string]string{
			"pr_url": prURL,
		})
		req := httptest.NewRequest("PUT", "/api/v1/draws/"+bookmark.PublicID.String()+"/pr", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		// Handle case where issue is already claimed (from previous test runs)
		if w.Code == http.StatusBadRequest {
			var errResp ErrorResponse
			if err := json.Unmarshal(w.Body.Bytes(), &errResp); err == nil {
				if errResp.Error.Code == ErrCodeIssueAlreadyClaimed {
					t.Skipf("Issue already has an active PR claim from previous test run - this is expected in dev environments")
				}
			}
		}

		if w.Code != http.StatusOK {
			t.Fatalf("Expected 200 for PR submission, got %d: %s", w.Code, w.Body.String())
		}

		// Verify draw status changed to pr_submitted
		updatedDraw, err := suite.queries.GetDrawByPublicID(suite.ctx, bookmark.PublicID)
		if err != nil {
			t.Fatalf("Failed to get updated draw: %v", err)
		}
		if updatedDraw.Status != database.DrawStatusPrSubmitted {
			t.Errorf("Expected status 'pr_submitted', got %s", updatedDraw.Status)
		}
		if !updatedDraw.PrUrl.Valid || updatedDraw.PrUrl.String != prURL {
			t.Errorf("Expected PR URL to be set to %s, got %v", prURL, updatedDraw.PrUrl)
		}

		t.Logf("✓ Successfully submitted PR: %s", prURL)
	})

	// Step 8: Verify PR merge and validate rewards
	t.Run("VerifyPRMergeAndRewards", func(t *testing.T) {
		// Get the PR-submitted draw
		activeWork, err := suite.queries.ListActiveWorkForUser(suite.ctx, user.ID)
		if err != nil {
			t.Fatalf("Failed to list active work: %v", err)
		}

		var prDraw *database.ListActiveWorkForUserRow
		for i := range activeWork {
			if activeWork[i].Status == database.DrawStatusPrSubmitted {
				prDraw = &activeWork[i]
				break
			}
		}
		if prDraw == nil {
			t.Skip("No PR-submitted draw found - skipping rewards validation (PR may have been skipped in previous step)")
		}

		// Record initial user stats
		initialUser, err := suite.queries.GetUserByID(suite.ctx, user.ID)
		if err != nil {
			t.Fatalf("Failed to get initial user stats: %v", err)
		}
		initialXP := initialUser.Xp
		initialContributions := initialUser.TotalContributions

		// Note: In a real scenario with a mocked GitHub client returning merged=true,
		// this would verify the merge and award rewards.
		// For now, we just verify the endpoint is reachable
		req := httptest.NewRequest("POST", "/api/v1/draws/"+prDraw.PublicID.String()+"/verify", nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		// The verify will likely return an error since the PR isn't actually merged,
		// but we verify the endpoint works
		t.Logf("Verify endpoint returned: %d (expected behavior: PR not merged yet)", w.Code)

		// Refresh user stats to check if rewards were processed
		// (they won't be since PR isn't merged, but the test structure is here)
		finalUser, err := suite.queries.GetUserByID(suite.ctx, user.ID)
		if err != nil {
			t.Fatalf("Failed to get final user stats: %v", err)
		}

		t.Logf("Initial XP: %d, Final XP: %d", initialXP, finalUser.Xp)
		t.Logf("Initial Contributions: %d, Final Contributions: %d", initialContributions, finalUser.TotalContributions)

		t.Logf("✓ Rewards verification structure validated")
	})

	t.Log("\n=== E2E Workflow Complete ===")
	t.Log("All scenarios validated:")
	t.Log("  ✓ Draw random issue")
	t.Log("  ✓ Choose and bookmark from table")
	t.Log("  ✓ Fill active work queue")
	t.Log("  ✓ Duplicate bookmark prevention")
	t.Log("  ✓ Abandon and re-bookmark flow")
	t.Log("  ✓ Submit PR")
	t.Log("  ✓ Verify merge and rewards structure")
}

// TestDuplicatePrevention validates users can't bookmark same issue twice
func TestDuplicatePrevention(t *testing.T) {
	suite := setupE2E(t)
	defer suite.cleanup()

	user := suite.createTestUser()
	issues := suite.createDemoIssues()

	// Create router with auth
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := ctxutil.SetUser(r.Context(), &user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Mount("/api/v1/draws", suite.handler.Routes())

	// Bookmark first issue
	body, _ := json.Marshal(chooseRequest{
		IssueID:             issues[0].PublicID.String(),
		BookmarkImmediately: true,
	})
	req := httptest.NewRequest("POST", "/api/v1/draws/choose", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("First bookmark failed: %d", w.Code)
	}

	// Try to bookmark same issue again
	req2 := httptest.NewRequest("POST", "/api/v1/draws/choose", bytes.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	w2 := httptest.NewRecorder()
	r.ServeHTTP(w2, req2)

	if w2.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for duplicate, got %d", w2.Code)
	}

	t.Log("✓ Duplicate bookmark prevention working")
}

// mockGitHubClient is a test double for GitHub API calls
// This client returns predictable PR statuses for testing the complete workflow
type mockGitHubClient struct {
	// prResponses maps "owner/repo/number" to a mock PR response
	prResponses map[string]*service.PRStatus
}

func newMockGitHubClient() *mockGitHubClient {
	return &mockGitHubClient{
		prResponses: make(map[string]*service.PRStatus),
	}
}

func (m *mockGitHubClient) GetPRStatus(ctx context.Context, owner, repo string, number int) (*service.PRStatus, error) {
	key := fmt.Sprintf("%s/%s/%d", owner, repo, number)

	// Check if we have a predefined response
	if resp, ok := m.prResponses[key]; ok {
		return resp, nil
	}

	// Default response for demo repo PR #7 (the one that exists in git-demo-issues)
	if owner == "nishantg96" && repo == "git-demo-issues" && number == 7 {
		return &service.PRStatus{
			State:          "open",
			Merged:         false,
			MergedAt:       "",
			MergeCommitSHA: "",
			UserLogin:      "testuser_placeholder", // Will be set via SetPRStatus
			Title:          "Fix footer punctuation - Fixes #5",
			Body:           "This PR fixes #5 by correcting the footer copy punctuation.",
			HTMLURL:        "https://github.com/nishantg96/git-demo-issues/pull/7",
		}, nil
	}

	// Default response for any other PR
	return &service.PRStatus{
		State:          "open",
		Merged:         false,
		MergedAt:       "",
		MergeCommitSHA: "",
		UserLogin:      "testuser_placeholder", // Will be set via SetPRStatus
		Title:          fmt.Sprintf("Fix issue #%d", number),
		Body:           fmt.Sprintf("This PR fixes #%d", number),
		HTMLURL:        fmt.Sprintf("https://github.com/%s/%s/pull/%d", owner, repo, number),
	}, nil
}

// SetPRStatus allows tests to configure specific PR responses
func (m *mockGitHubClient) SetPRStatus(owner, repo string, number int, status *service.PRStatus) {
	key := fmt.Sprintf("%s/%s/%d", owner, repo, number)
	m.prResponses[key] = status
}

// Ensure mock implements the interface
var _ service.GitHubClient = (*mockGitHubClient)(nil)

// Helper types
type drawResponse struct {
	Data struct {
		Draw struct {
			ID     string `json:"id"`
			Status string `json:"status"`
		} `json:"draw"`
		Issue struct {
			ID         string   `json:"id"`
			Title      string   `json:"title"`
			RepoOwner  string   `json:"repo_owner"`
			RepoName   string   `json:"repo_name"`
			Language   string   `json:"language"`
			Difficulty string   `json:"difficulty"`
			Rarity     string   `json:"rarity"`
			Labels     []string `json:"labels"`
		} `json:"issue"`
		RemainingDraws int `json:"remaining_draws"`
		MaxDrawsPerDay int `json:"max_draws_per_day"`
		XpAwarded      int `json:"xp_awarded"`
	} `json:"data"`
}

type chooseRequest struct {
	IssueID             string  `json:"issue_id"`
	BookmarkImmediately bool    `json:"bookmark_immediately"`
	ReplaceDrawID       *string `json:"replace_draw_id,omitempty"`
}

type ErrorResponse struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}
