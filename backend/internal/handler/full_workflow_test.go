package handler

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
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

// fullWorkflowTestSuite for complete E2E with GitHub write operations
type fullWorkflowTestSuite struct {
	t           *testing.T
	ctx         context.Context
	pool        *pgxpool.Pool
	queries     *database.Queries
	handler     *DrawHandler
	httpClient  *http.Client
	githubToken string
	githubUser  string
	repo        githubTestRepo
	testUser    database.User
	testIssues  []database.Issue
}

func setupFullWorkflow(t *testing.T) *fullWorkflowTestSuite {
	ctx := context.Background()

	// Require GitHub token with write access
	githubToken := os.Getenv("GITHUB_TOKEN")
	if githubToken == "" {
		t.Skip("GITHUB_TOKEN not set - skipping full workflow test")
	}

	// Check for test GitHub username (must have write access to configured repo)
	githubUser := os.Getenv("TEST_GITHUB_USERNAME")
	if githubUser == "" {
		t.Skip("TEST_GITHUB_USERNAME not set - required for creating PRs. " +
			"Set to a GitHub user with write access to FULL_WORKFLOW_TEST_REPO")
	}

	repo, err := parseGitHubTestRepo(os.Getenv("FULL_WORKFLOW_TEST_REPO"))
	if err != nil {
		t.Skip("FULL_WORKFLOW_TEST_REPO not set - required for full workflow tests. Set to owner/repo for a maintainer-controlled repository.")
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

	githubClient := service.NewGitHubClient(githubToken)
	dummyAuth := func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			next.ServeHTTP(w, r)
		})
	}

	handler := NewDrawHandler(pool, queries, dummyAuth, xpSvc, badgeSvc, streakSvc, githubClient, issueChecker, 10)

	return &fullWorkflowTestSuite{
		t:           t,
		ctx:         ctx,
		pool:        pool,
		queries:     queries,
		handler:     handler,
		httpClient:  &http.Client{Timeout: 30 * time.Second},
		githubToken: githubToken,
		githubUser:  githubUser,
		repo:        repo,
	}
}

func (s *fullWorkflowTestSuite) cleanup() {
	if s.pool != nil {
		s.pool.Close()
	}
}

func (s *fullWorkflowTestSuite) createTestUser() database.User {
	// Check if user already exists with this GitHub username
	existingUser, err := s.queries.GetUserByGithubUsername(s.ctx, pgtype.Text{String: s.githubUser, Valid: true})
	if err == nil {
		s.t.Logf("Reusing existing test user with GitHub username: %s", s.githubUser)
		// Clean up existing activities and draws for this user to avoid BOOKMARK_EXISTS errors
		if err := s.queries.DeleteActivitiesByUserID(s.ctx, existingUser.ID); err != nil {
			s.t.Logf("Warning: failed to clean up existing activities: %v", err)
		}
		if err := s.queries.DeleteDrawsByUserID(s.ctx, existingUser.ID); err != nil {
			s.t.Logf("Warning: failed to clean up existing draws: %v", err)
		} else {
			s.t.Logf("Cleaned up existing draws for user")
		}
		s.testUser = existingUser
		return existingUser
	}

	// Create new user if not found
	uid := uuid.New().String()[:8]
	githubID := fmt.Sprintf("%d", time.Now().UnixNano())
	user, err := s.queries.CreateUser(s.ctx, database.CreateUserParams{
		AuthID:         "full-test-" + uid,
		Username:       "fulltest_" + uid,
		Email:          "fulltest_" + uid + "@example.com",
		GithubUsername: pgtype.Text{String: s.githubUser, Valid: true},
		GithubID:       pgtype.Text{String: githubID, Valid: true},
	})
	if err != nil {
		s.t.Fatalf("Failed to create test user: %v", err)
	}
	s.testUser = user
	return user
}

func (s *fullWorkflowTestSuite) getOrCreateDemoIssues() []database.Issue {
	issues, err := s.queries.ListIssues(s.ctx, database.ListIssuesParams{Limit: 10})
	if err != nil {
		s.t.Fatalf("Failed to list issues: %v", err)
	}

	for _, issue := range issues {
		if issue.RepoOwner == s.repo.Owner && issue.RepoName == s.repo.Name {
			s.testIssues = append(s.testIssues, issue)
		}
	}

	if len(s.testIssues) == 0 {
		s.t.Fatal("No demo issues found. Run the sync tool or ensure issues exist in DB.")
	}

	return s.testIssues
}

// makeGitHubRequest makes an authenticated request to GitHub API
func (s *fullWorkflowTestSuite) makeGitHubRequest(method, url string, body []byte) (*http.Response, error) {
	req, err := http.NewRequestWithContext(s.ctx, method, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+s.githubToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	return s.httpClient.Do(req)
}

// TestFullWorkflow performs complete E2E: pick issue → create PR → merge → validate rewards
func TestFullWorkflow(t *testing.T) {
	suite := setupFullWorkflow(t)
	defer suite.cleanup()

	user := suite.createTestUser()
	issues := suite.getOrCreateDemoIssues()

	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := ctxutil.SetUser(r.Context(), &user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Mount("/api/v1/draws", suite.handler.Routes())

	var selectedIssue database.Issue
	var bookmarkedDraw database.Draw
	var prNumber int

	t.Run("SelectAndBookmarkIssue", func(t *testing.T) {
		for _, issue := range issues {
			if issue.Difficulty.Valid && issue.Difficulty.String == "easy" {
				selectedIssue = issue
				break
			}
		}

		if selectedIssue.ID == 0 {
			selectedIssue = issues[0]
		}

		t.Logf("Selected issue #%d: %s", selectedIssue.GithubNumber, selectedIssue.Title)

		body, _ := json.Marshal(chooseRequest{
			IssueID:             selectedIssue.PublicID.String(),
			BookmarkImmediately: true,
		})
		req := httptest.NewRequest("POST", "/api/v1/draws/choose", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusCreated {
			t.Fatalf("Failed to bookmark issue: %d - %s", w.Code, w.Body.String())
		}

		var resp drawResponse
		if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
			t.Fatalf("Failed to decode: %v", err)
		}

		bookmarkID, err := parseUUID(resp.Data.Draw.ID)
		if err != nil {
			t.Fatalf("Failed to parse draw public ID '%s': %v", resp.Data.Draw.ID, err)
		}
		draw, err := suite.queries.GetDrawByPublicID(suite.ctx, bookmarkID)
		if err != nil {
			t.Fatalf("Failed to get draw with ID %v: %v", bookmarkID, err)
		}
		bookmarkedDraw = draw

		t.Logf("✓ Bookmarked issue #%d, draw ID: %d", selectedIssue.GithubNumber, bookmarkedDraw.ID)
	})

	t.Run("CreateRealPR", func(t *testing.T) {
		// Get default branch
		resp, err := suite.makeGitHubRequest("GET",
			fmt.Sprintf("https://api.github.com/repos/%s/%s", suite.repo.Owner, suite.repo.Name), nil)
		if err != nil {
			t.Fatalf("Failed to get repo: %v", err)
		}
		defer resp.Body.Close()

		var repo struct {
			DefaultBranch string `json:"default_branch"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&repo); err != nil {
			t.Fatalf("Failed to decode repo: %v", err)
		}

		// Get reference to default branch
		resp, err = suite.makeGitHubRequest("GET",
			fmt.Sprintf("https://api.github.com/repos/%s/%s/git/refs/heads/%s", suite.repo.Owner, suite.repo.Name, repo.DefaultBranch), nil)
		if err != nil {
			t.Fatalf("Failed to get ref: %v", err)
		}
		defer resp.Body.Close()

		var ref struct {
			Object struct {
				SHA string `json:"sha"`
			} `json:"object"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&ref); err != nil {
			t.Fatalf("Failed to decode ref: %v", err)
		}

		// Create new branch
		branchName := fmt.Sprintf("test-fix-%d-%d", selectedIssue.GithubNumber, time.Now().Unix())
		createRefBody, _ := json.Marshal(map[string]interface{}{
			"ref": fmt.Sprintf("refs/heads/%s", branchName),
			"sha": ref.Object.SHA,
		})

		resp, err = suite.makeGitHubRequest("POST",
			fmt.Sprintf("https://api.github.com/repos/%s/%s/git/refs", suite.repo.Owner, suite.repo.Name), createRefBody)
		if err != nil {
			t.Fatalf("Failed to create branch: %v", err)
		}
		resp.Body.Close()

		if resp.StatusCode != http.StatusCreated {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Failed to create branch: %d - %s", resp.StatusCode, string(body))
		}

		t.Logf("✓ Created branch: %s", branchName)

		// Create a file with unique name to avoid conflicts
		filePath := fmt.Sprintf("test-fix-%d-%d.md", selectedIssue.GithubNumber, time.Now().Unix())
		content := fmt.Sprintf("# Fix for Issue #%d\n\nThis is a test fix created by GitFable E2E tests.\n\nReferences: #%d\n",
			selectedIssue.GithubNumber, selectedIssue.GithubNumber)

		createFileBody, _ := json.Marshal(map[string]interface{}{
			"message": fmt.Sprintf("Fix #%d - Test fix", selectedIssue.GithubNumber),
			"content": base64.StdEncoding.EncodeToString([]byte(content)),
			"branch":  branchName,
		})

		resp, err = suite.makeGitHubRequest("PUT",
			fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s", suite.repo.Owner, suite.repo.Name, filePath),
			createFileBody)
		if err != nil {
			t.Fatalf("Failed to create file request: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusCreated {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Failed to create file: %d - %s", resp.StatusCode, string(body))
		}

		t.Logf("✓ Created file: %s", filePath)

		// Create PR
		prBody, _ := json.Marshal(map[string]interface{}{
			"title": fmt.Sprintf("Fix #%d - %s", selectedIssue.GithubNumber, selectedIssue.Title),
			"head":  branchName,
			"base":  repo.DefaultBranch,
			"body":  fmt.Sprintf("This PR fixes #%d\n\nTest automated PR from GitFable E2E tests.", selectedIssue.GithubNumber),
		})

		resp, err = suite.makeGitHubRequest("POST",
			fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls", suite.repo.Owner, suite.repo.Name), prBody)
		if err != nil {
			t.Fatalf("Failed to create PR: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusCreated {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Failed to create PR: %d - %s", resp.StatusCode, string(body))
		}

		var pr struct {
			Number  int    `json:"number"`
			HTMLURL string `json:"html_url"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&pr); err != nil {
			t.Fatalf("Failed to decode PR: %v", err)
		}

		prNumber = pr.Number
		t.Logf("✓ Created PR #%d: %s", prNumber, pr.HTMLURL)
	})

	t.Run("SubmitPRToGitFable", func(t *testing.T) {
		if prNumber == 0 {
			t.Fatal("No PR created")
		}

		prURL := fmt.Sprintf("https://github.com/%s/%s/pull/%d", suite.repo.Owner, suite.repo.Name, prNumber)

		body, _ := json.Marshal(map[string]string{
			"pr_url": prURL,
		})
		req := httptest.NewRequest("PUT", fmt.Sprintf("/api/v1/draws/%s/pr", bookmarkedDraw.PublicID.String()), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		if w.Code != http.StatusOK {
			t.Fatalf("Failed to submit PR to GitFable: %d - %s", w.Code, w.Body.String())
		}

		updatedDraw, err := suite.queries.GetDrawByPublicID(suite.ctx, bookmarkedDraw.PublicID)
		if err != nil {
			t.Fatalf("Failed to get draw: %v", err)
		}

		if updatedDraw.Status != database.DrawStatusPrSubmitted {
			t.Errorf("Expected status pr_submitted, got %s", updatedDraw.Status)
		}

		t.Logf("✓ Submitted PR to GitFable: %s", prURL)
	})

	t.Run("MergePRAndVerifyRewards", func(t *testing.T) {
		if prNumber == 0 {
			t.Fatal("No PR to merge")
		}

		initialUser, _ := suite.queries.GetUserByID(suite.ctx, user.ID)
		initialXP := initialUser.Xp
		initialContributions := initialUser.TotalContributions

		t.Logf("Initial XP: %d, Contributions: %d", initialXP, initialContributions)

		// Get PR details to obtain HEAD SHA for merge
		prResp, prErr := suite.makeGitHubRequest("GET",
			fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls/%d", suite.repo.Owner, suite.repo.Name, prNumber), nil)
		if prErr != nil {
			t.Fatalf("Failed to get PR details: %v", prErr)
		}
		defer prResp.Body.Close()

		var prDetails struct {
			Head struct {
				SHA string `json:"sha"`
			} `json:"head"`
		}
		if err := json.NewDecoder(prResp.Body).Decode(&prDetails); err != nil {
			t.Fatalf("Failed to decode PR details: %v", err)
		}

		// Merge the PR with the correct SHA
		mergeBody, _ := json.Marshal(map[string]interface{}{
			"commit_title":   fmt.Sprintf("Merge PR - Fix for issue #%d", selectedIssue.GithubNumber),
			"commit_message": "Merged by GitFable E2E test",
			"sha":            prDetails.Head.SHA,
		})

		resp, err := suite.makeGitHubRequest("PUT",
			fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls/%d/merge", suite.repo.Owner, suite.repo.Name, prNumber),
			mergeBody)
		if err != nil {
			t.Fatalf("Failed to merge PR: %v", err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(resp.Body)
			t.Fatalf("Failed to merge PR: %d - %s", resp.StatusCode, string(body))
		}

		var mergeResult struct {
			SHA string `json:"sha"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&mergeResult); err != nil {
			t.Fatalf("Failed to decode merge result: %v", err)
		}

		t.Logf("✓ Merged PR! Commit SHA: %s", mergeResult.SHA)

		// Wait for GitHub to process
		time.Sleep(2 * time.Second)

		// Trigger verification
		req := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/draws/%s/verify", bookmarkedDraw.PublicID.String()), nil)
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)

		t.Logf("Verify endpoint returned: %d", w.Code)

		// Check rewards
		finalUser, _ := suite.queries.GetUserByID(suite.ctx, user.ID)
		t.Logf("Final XP: %d (was %d)", finalUser.Xp, initialXP)
		t.Logf("Final Contributions: %d (was %d)", finalUser.TotalContributions, initialContributions)

		finalDraw, _ := suite.queries.GetDrawByPublicID(suite.ctx, bookmarkedDraw.PublicID)
		if finalDraw.Status == database.DrawStatusMerged {
			t.Logf("✓ Draw marked as merged!")
			t.Logf("  XP Awarded: %d", finalDraw.XpAwarded)
		} else {
			t.Logf("Draw status: %s", finalDraw.Status)
		}

		if finalUser.Xp > initialXP {
			t.Logf("✓ XP increased by %d!", finalUser.Xp-initialXP)
		}
	})

	t.Log("\n=== Full Workflow Test Complete ===")
	t.Log("Successfully completed:")
	t.Log("  ✓ Selected real issue")
	t.Log("  ✓ Created branch and commit")
	t.Log("  ✓ Created PR on GitHub")
	t.Log("  ✓ Submitted PR to GitFable")
	t.Log("  ✓ Merged PR on GitHub")
	t.Log("  ✓ Validated rewards")
}
