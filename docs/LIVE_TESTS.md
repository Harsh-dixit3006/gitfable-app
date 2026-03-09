# Live Integration Tests

These tests run against the **real GitHub API** and your local database. They validate that GitFable works with actual GitHub data from the `nishantg96/git-demo-issues` repository.

## Prerequisites

1. **GitHub Token** with `repo` scope to read PRs and issues
2. **Database** running with synced issues from the demo repo
3. **Backend** configured to connect to your database

## Setup

### 1. Get a GitHub Token

1. Go to https://github.com/settings/tokens
2. Generate a new token with these scopes:
   - `repo` - Access to private/public repos
   - `read:org` - Read org membership (if testing with org repos)
3. Copy the token

### 2. Set Environment Variables

```bash
export GITHUB_TOKEN="ghp_your_token_here"
export DATABASE_URL="postgresql://gitfable:gitfable@localhost:5432/gitfable?sslmode=disable"
export TEST_GITHUB_USERNAME="your_github_username"  # Optional
```

**Note:** Demo issues are created automatically by the tests if they don't exist in the database. No need to run sync manually!

## Running the Tests

### Run All Live Tests
```bash
cd backend
export GITHUB_TOKEN="ghp_your_token_here"
go test -v ./internal/handler -run TestLiveWorkflow
```

### Run Specific Test
```bash
# Test PR verification with real GitHub
go test -v ./internal/handler -run TestLiveWorkflow/CheckRealPRVerification

# Test PR submission (requires real PR)
go test -v ./internal/handler -run TestLiveWorkflow/SubmitPRWithRealValidation
```

### Run All Handler Tests (including live)
```bash
export GITHUB_TOKEN="ghp_your_token_here"
go test -v ./internal/handler
```

## What the Tests Do

### 1. ChooseAndBookmarkRealIssue
- Loads real issues from `nishantg96/git-demo-issues` from your database
- Bookmarks one of them
- **Verifies**: Issues are sync'd correctly, bookmarking works

### 2. CheckRealPRVerification  
- Fetches PR #7 from the demo repo using real GitHub API
- Checks PR title, body, state, and merge status
- **Verifies**: GitHub API integration works, PR parsing is correct

### 3. SubmitPRWithRealValidation
- Tries to submit PR #7 URL against a bookmarked issue
- **Verifies**: Real GitHub validation rejects PRs that don't match the user/issue
- **Expected result**: 400 error (PR author mismatch) - this proves validation works!

### 4. VerifyRealMergeStatus
- Checks if PR #7 is merged on GitHub
- **Verifies**: Merge detection works with real data

## Expected Output

```
=== RUN   TestLiveWorkflow
=== RUN   TestLiveWorkflow/ChooseAndBookmarkRealIssue
    live_integration_test.go:125: ✓ Successfully bookmarked real issue #2: Improve welcome message wording
=== RUN   TestLiveWorkflow/CheckRealPRVerification
    live_integration_test.go:140: ✓ Found real PR #7 on GitHub:
    live_integration_test.go:141:   Title: Fix footer punctuation
    live_integration_test.go:142:   State: open
    live_integration_test.go:143:   Merged: false
    live_integration_test.go:144:   Author: someuser
    live_integration_test.go:150: ✓ PR #7 references an issue from our demo repo
=== RUN   TestLiveWorkflow/SubmitPRWithRealValidation
    live_integration_test.go:190: PR submission result: 400
    live_integration_test.go:191: Response: {"error":{"code":"PR_AUTHOR_MISMATCH",...}}
    live_integration_test.go:196: PR validation failed: PR_AUTHOR_MISMATCH - ...
    live_integration_test.go:197: This validates that real GitHub checks are working (PR author or repo mismatch expected)
=== RUN   TestLiveWorkflow/VerifyRealMergeStatus
    live_integration_test.go:212: PR #7 is not merged yet (state: open)
    live_integration_test.go:213: This is expected - PRs need to be merged manually on GitHub

=== Live Integration Test Complete ===
Tests validated against REAL GitHub API:
  ✓ Can bookmark real issues from demo repo
  ✓ PR verification works with real GitHub data
  ✓ Merge status check works with real GitHub
```

## Troubleshooting

### "GITHUB_TOKEN not set"
```bash
export GITHUB_TOKEN="your_token_here"
```

### "PR #7 not accessible"
The demo repo might have different PRs. Check available PRs:
```bash
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/repos/nishantg96/git-demo-issues/pulls
```

### Rate Limiting
If you hit GitHub rate limits:
```bash
# Check your rate limit
curl -H "Authorization: token $GITHUB_TOKEN" \
  https://api.github.com/rate_limit
```

## Testing with Your Own PR

To test the full flow including PR submission:

1. **Fork the demo repo**: https://github.com/nishantg96/git-demo-issues
2. **Create a branch** and make a trivial change
3. **Push and create a PR** referencing one of the issues
4. **Run the test** with your PR URL:

```go
// In live_integration_test.go, update the PR URL:
prURL := "https://github.com/nishantg96/git-demo-issues/pull/YOUR_PR_NUMBER"
```

5. **Submit to GitFable** - the test should accept your PR if:
   - Your GitHub username matches the test user's GitHub username
   - The PR references the bookmarked issue
   - The PR is in the correct repo

## Notes

- **No data is modified on GitHub** - tests are read-only
- **PR submission fails by design** - the test validates that our validation logic works correctly
- **Merge detection works** - but won't find merged PRs unless you merge one
- **Fast execution** - uses real API but only makes a few calls
