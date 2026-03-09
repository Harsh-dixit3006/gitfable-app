# Full Workflow Test

This test performs a **complete end-to-end workflow** including creating real GitHub PRs and merging them.

## What It Does

The test performs the complete GitFable workflow:

1. **Select Issue** - Picks an available issue from the demo repo
2. **Bookmark** - Bookmarks the issue in GitFable
3. **Create Branch** - Creates a new git branch via GitHub API
4. **Create File** - Adds a test file with the fix
5. **Create PR** - Opens a pull request on GitHub
6. **Submit PR** - Submits the PR URL to GitFable
7. **Merge PR** - Merges the PR on GitHub via API
8. **Verify Rewards** - Checks that XP and rewards were awarded

## Prerequisites

⚠️ **WARNING**: This test makes REAL changes to the demo repository!

1. **GitHub Token** with `repo` scope (write access)
2. **Write Access** to `nishantg96/git-demo-issues`
3. **Test GitHub Username** that matches your token

## Setup

```bash
export GITHUB_TOKEN="ghp_your_token_here"
export TEST_GITHUB_USERNAME="your_github_username"
export DATABASE_URL="postgresql://gitfable:gitfable@localhost:5432/gitfable?sslmode=disable"
```

## Running the Test

```bash
cd backend
go test -v ./internal/handler -run TestFullWorkflow
```

## Expected Output

```
=== RUN   TestFullWorkflow
=== RUN   TestFullWorkflow/SelectAndBookmarkIssue
    full_workflow_test.go:115: Selected issue #2: Improve welcome message wording
    full_workflow_test.go:135: ✓ Bookmarked issue #2, draw ID: 123
=== RUN   TestFullWorkflow/CreateRealPR
    full_workflow_test.go:155: ✓ Created branch: test-fix-2-1709234567
    full_workflow_test.go:172: ✓ Created file: test-fix-2.md
    full_workflow_test.go:195: ✓ Created PR #8: https://github.com/nishantg96/git-demo-issues/pull/8
=== RUN   TestFullWorkflow/SubmitPRToGitFable
    full_workflow_test.go:215: ✓ Submitted PR to GitFable
=== RUN   TestFullWorkflow/MergePRAndVerifyRewards
    full_workflow_test.go:230: Initial XP: 0, Contributions: 0
    full_workflow_test.go:255: ✓ Merged PR! Commit SHA: abc123...
    full_workflow_test.go:268: Final XP: 55 (was 0)
    full_workflow_test.go:269: Final Contributions: 1 (was 0)
    full_workflow_test.go:274: ✓ Draw marked as merged!
    full_workflow_test.go:275:   XP Awarded: 55
    full_workflow_test.go:279: ✓ XP increased by 55!

=== Full Workflow Test Complete ===
Successfully completed:
  ✓ Selected real issue
  ✓ Created branch and commit
  ✓ Created PR on GitHub
  ✓ Submitted PR to GitFable
  ✓ Merged PR on GitHub
  ✓ Validated rewards
```

## What Gets Created

The test creates:
- A new branch: `test-fix-{issue_number}-{timestamp}`
- A test file: `test-fix-{issue_number}.md`
- A pull request referencing the issue
- A merge commit

## Cleanup

The test does NOT clean up the:
- Merged PR (stays in repo history)
- Merged branch (GitHub may auto-delete)
- Test files (part of the repo now)

This is intentional - it leaves a trail of real activity for debugging.

## Troubleshooting

### "TEST_GITHUB_USERNAME not set"
```bash
export TEST_GITHUB_USERNAME="your_actual_github_username"
```

### "Failed to create branch: 403"
Your token doesn't have write access. Check:
1. Token has `repo` scope
2. You have write access to `nishantg96/git-demo-issues`

### "Failed to merge PR: 405"
The PR might have conflicts or required checks. Check the PR on GitHub.

### "No demo issues found"
Run the sync tool first:
```bash
make sync-issues
```

## Security Notes

- Never commit your `GITHUB_TOKEN` to git
- The token should have minimal permissions (just `repo`)
- The test creates actual commits and PRs
- Generated branches/files are clearly named as test data

## Running Individual Steps

You can run just specific steps:

```bash
# Just create the PR
go test -v ./internal/handler -run TestFullWorkflow/CreateRealPR

# Just test PR submission
go test -v ./internal/handler -run TestFullWorkflow/SubmitPRToGitFable

# Just test merge and rewards
go test -v ./internal/handler -run TestFullWorkflow/MergePRAndVerifyRewards
```

## Alternative: Manual Testing

If you prefer to test manually:

1. Pick an issue from https://github.com/nishantg96/git-demo-issues
2. Bookmark it in GitFable
3. Create a branch and PR manually
4. Submit PR URL to GitFable
5. Merge the PR on GitHub
6. Watch for the webhook or trigger verification
7. Check your profile for XP increase
