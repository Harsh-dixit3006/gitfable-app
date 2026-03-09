# Testing Guide

Complete testing documentation for GitFable, including unit tests, integration tests, live GitHub API tests, and full end-to-end workflow tests.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Test Types](#test-types)
3. [Running Tests](#running-tests)
4. [Live Integration Tests](#live-integration-tests)
5. [Full Workflow Test](#full-workflow-test)
6. [Docker Testing](#docker-testing)
7. [Troubleshooting](#troubleshooting)

---

## Quick Start

```bash
# Fast unit tests (no external dependencies)
make test-backend

# Run all tests in Docker (recommended)
make test-docker

# Full E2E test with real GitHub PRs
make test-full-workflow

# Clean up test environment
make test-cleanup
```

---

## Test Types

### 1. Unit Tests
- **Fast**: < 2 seconds
- **Isolated**: Mocked dependencies
- **Coverage**: Handler logic, service functions, utility functions
- **Location**: `backend/internal/handler/*_test.go`

### 2. Integration Tests
- **Database**: Real PostgreSQL (test database)
- **No external APIs**: Mocked GitHub client
- **Coverage**: API endpoints, database queries, transactions
- **Duration**: ~5 seconds

### 3. Live Integration Tests
- **Real GitHub API**: Read-only calls to GitHub
- **Validates**: PR verification, issue checking
- **Requires**: `GITHUB_TOKEN` with `repo` scope
- **Duration**: ~10 seconds

### 4. Full Workflow Test
- **Complete E2E**: Creates real PRs on GitHub
- **Validates**: Entire user journey from draw to rewards
- **Requires**: Write access to demo repo
- **Duration**: ~30 seconds
- **Warning**: Makes permanent changes (branches, PRs, commits)

---

## Running Tests

### Basic Commands

```bash
# All backend tests (excluding live tests without token)
cd backend && go test ./...

# Verbose output
make test-backend

# Specific test
go test -v ./internal/handler -run TestDraw

# Specific test with pattern
go test -v ./internal/handler -run "TestComplete.*"
```

### Environment Setup

```bash
# For live and full workflow tests
export GITHUB_TOKEN="ghp_your_token_here"
export TEST_GITHUB_USERNAME="your_github_username"
export DATABASE_URL="postgresql://gitfable:gitfable@localhost:5432/gitfable?sslmode=disable"
```

### Getting a GitHub Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - ✅ `repo` (Full control of private repositories)
4. Generate and copy the token
5. Never commit this token!

---

## Live Integration Tests

These tests validate GitHub API integration with **read-only operations**.

### What They Do

1. **ChooseAndBookmarkRealIssue**
   - Loads real issues from `nishantg96/git-demo-issues`
   - Bookmarks one issue
   - **Validates**: Issue sync, bookmarking works

2. **CheckRealPRVerification**
   - Fetches PR #7 from demo repo
   - Checks PR title, body, state, merge status
   - **Validates**: GitHub API integration, PR parsing

3. **SubmitPRWithRealValidation**
   - Submits PR #7 URL against bookmarked issue
   - **Expected result**: 400 error (author mismatch)
   - **Validates**: Real GitHub validation works!

4. **VerifyRealMergeStatus**
   - Checks if PR #7 is merged
   - **Validates**: Merge detection with real data

### Running Live Tests

```bash
# All live tests
export GITHUB_TOKEN="ghp_your_token"
go test -v ./internal/handler -run TestLiveWorkflow

# Specific live test
go test -v ./internal/handler -run TestLiveWorkflow/CheckRealPRVerification
```

### Expected Output

```
=== RUN   TestLiveWorkflow
=== RUN   TestLiveWorkflow/ChooseAndBookmarkRealIssue
    ✓ Successfully bookmarked real issue #2
=== RUN   TestLiveWorkflow/CheckRealPRVerification
    ✓ Found real PR #7 on GitHub
=== RUN   TestLiveWorkflow/SubmitPRWithRealValidation
    ✓ PR validation failed as expected (PR_AUTHOR_MISMATCH)
=== RUN   TestLiveWorkflow/VerifyRealMergeStatus
    PR #7 is not merged yet (expected)

=== Live Integration Test Complete ===
  ✓ Real GitHub API integration works
  ✓ PR verification validates correctly
  ✓ Merge detection works
```

**Note:** Tests validate that validation logic works - failures are expected and prove the system works correctly!

---

## Full Workflow Test

This test performs a **complete end-to-end workflow** including creating real GitHub PRs and merging them.

### ⚠️ Important Warning

This test makes **REAL changes** to the demo repository:
- Creates branches
- Creates files
- Opens pull requests
- Merges pull requests
- Creates commits

These changes **cannot be undone** and become part of git history.

### Prerequisites

1. **GitHub Token** with `repo` scope (write access)
2. **Write Access** to `nishantg96/git-demo-issues`
3. **Test GitHub Username** matching your token

### Test Steps

1. **Select Issue** - Picks available issue from demo repo
2. **Bookmark** - Bookmarks issue in GitFable
3. **Create Branch** - Creates git branch via GitHub API
4. **Create File** - Adds test file with fix
5. **Create PR** - Opens pull request on GitHub
6. **Submit PR** - Submits PR URL to GitFable
7. **Merge PR** - Merges PR on GitHub via API
8. **Verify Rewards** - Checks XP and rewards awarded

### Running the Test

```bash
# Using Make (recommended - handles Docker setup)
make test-full-workflow

# Or locally (requires database running)
export GITHUB_TOKEN="ghp_your_token"
export TEST_GITHUB_USERNAME="your_username"
cd backend
go test -v ./internal/handler -run TestFullWorkflow
```

### Expected Output

```
=== RUN   TestFullWorkflow
=== RUN   TestFullWorkflow/SelectAndBookmarkIssue
    ✓ Selected issue #2: Improve welcome message
    ✓ Bookmarked issue #2
=== RUN   TestFullWorkflow/CreateRealPR
    ✓ Created branch: test-fix-2-1709234567
    ✓ Created file: test-fix-2.md
    ✓ Created PR #8
=== RUN   TestFullWorkflow/SubmitPRToGitFable
    ✓ Submitted PR to GitFable
=== RUN   TestFullWorkflow/MergePRAndVerifyRewards
    Initial XP: 0, Contributions: 0
    ✓ Merged PR! Commit SHA: abc123...
    Final XP: 55 (was 0)
    Final Contributions: 1 (was 0)
    ✓ XP increased by 55!

=== Full Workflow Test Complete ===
  ✓ Selected real issue
  ✓ Created branch and commit
  ✓ Created PR on GitHub
  ✓ Submitted PR to GitFable
  ✓ Merged PR on GitHub
  ✓ Validated rewards
```

### What's Created

- **Branch**: `test-fix-{issue_number}-{timestamp}`
- **File**: `test-fix-{issue_number}.md`
- **Pull Request**: Referencing the issue
- **Merge Commit**: Permanent in repo history

### Running Individual Steps

```bash
# Just create the PR
go test -v ./internal/handler -run TestFullWorkflow/CreateRealPR

# Just test merge and rewards
go test -v ./internal/handler -run TestFullWorkflow/MergePRAndVerifyRewards
```

---

## Docker Testing

### Why Docker?

- **Isolated**: Separate test database (port 5433)
- **Clean**: Fresh database for each run
- **Safe**: Won't interfere with dev environment
- **Complete**: Includes all test types

### Test Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Test Runner                          │
│              (Docker container with Go)                 │
└──────────────────┬──────────────────────────────────────┘
                   │
       ┌───────────┴───────────┐
       │                       │
┌──────▼──────┐        ┌──────▼──────┐
│ PostgreSQL  │        │    Redis    │
│   :5433     │        │   :6380     │
└─────────────┘        └─────────────┘
       │                       │
       └───────────┬───────────┘
                   │
            ┌──────▼──────┐
            │  GitHub API │
            │   (real)    │
            └─────────────┘
```

### Setup

```bash
# Create test environment file
make env-test

# Edit with your credentials
# docker/.env.test:
GITHUB_TOKEN=ghp_your_token
TEST_GITHUB_USERNAME=your_username
```

### Running in Docker

```bash
# Complete test suite (unit + integration + live + full workflow)
make test-full-workflow

# Just unit and integration (no real GitHub calls)
make test-docker

# Run specific test
docker compose -f docker/docker-compose.test.yml \
  --env-file docker/.env.test \
  run --rm test-runner \
  go test -v ./internal/handler -run TestFullWorkflow
```

### Cleanup

```bash
# Stop test containers
make test-docker-down

# Clean everything (removes volumes too)
make test-cleanup
```

---

## Troubleshooting

### "GITHUB_TOKEN not set"

```bash
# Add to environment
export GITHUB_TOKEN="ghp_your_token"

# Or add to docker/.env.test
echo 'GITHUB_TOKEN=ghp_your_token' >> docker/.env.test
```

### "Failed to create branch: 403"

Your token lacks write access:
1. Check token has `repo` scope
2. Verify you're a collaborator on `nishantg96/git-demo-issues`
3. Test with curl:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     https://api.github.com/repos/nishantg96/git-demo-issues
   ```

### "Port 5433 already in use"

Another test instance is running:
```bash
make test-docker-down
make test-cleanup
```

### "No demo issues found"

Sync issues first:
```bash
make sync-issues
```

### "Failed to merge PR: 405"

The PR might have conflicts or required checks. Check the PR on GitHub.

### Rate Limiting

Check your GitHub rate limit:
```bash
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/rate_limit
```

### Tests pass but no PR created

Check if `TEST_GITHUB_USERNAME` is set. Full Workflow test needs:
- `GITHUB_TOKEN`
- `TEST_GITHUB_USERNAME`
- Write access to demo repo

### "Permission denied" on creds

Test container needs read access to local credential files:
```bash
chmod +r creds/*.json
```

---

## CI/CD Integration

For automated testing in CI/CD:

```yaml
# Example GitHub Actions
- name: Run Tests
  run: make test-docker
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    TEST_GITHUB_USERNAME: ${{ github.actor }}
```

**Note:** Skip Full Workflow test in CI (requires repo write access):

```bash
# Run all tests except full workflow
make test-docker TEST_FLAGS="-run 'Test[^Full]'"
```

---

## Safety & Security

✅ **Safe:**
- Tests use isolated test database
- Separate Docker containers
- Different ports than dev environment
- Test environment completely separate

⚠️ **Careful:**
- Full Workflow test makes REAL changes to demo repo
- Creates branches and PRs on GitHub
- Cannot be undone (git history)
- Uses real GitHub API quota

🔒 **Security:**
- `.env.test` is in `.gitignore` (never committed)
- Credentials only in Docker container
- Token never logged or printed
- Use minimal permissions (`repo` scope only)

---

## See Also

- [Backend E2E Tests](../backend/internal/handler/workflow_e2e_test.go)
- [Full Workflow Test Code](../backend/internal/handler/full_workflow_test.go)
- [Live Integration Test Code](../backend/internal/handler/live_integration_test.go)
