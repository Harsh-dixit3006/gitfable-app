# Testing with Docker

This guide explains how to run the complete E2E test suite using Docker, which includes creating real PRs on GitHub and validating the full workflow.

## Quick Start

### 1. Create Test Environment File

```bash
make env-test
```

This creates `docker/.env.test` from the example file.

### 2. Add Your Credentials

Edit `docker/.env.test`:

```bash
# GitHub credentials for full workflow tests
GITHUB_TOKEN=ghp_your_actual_github_token_here
TEST_GITHUB_USERNAME=your_actual_github_username

# Optional: customize test database
DATABASE_URL=postgresql://gitfable:gitfable@postgres:5432/gitfable_test?sslmode=disable
```

**⚠️ IMPORTANT:** Never commit this file! It's already in `.gitignore`.

### 3. Run Full Workflow Test

```bash
make test-full-workflow
```

This will:
1. Start PostgreSQL and Redis in Docker (isolated test instances)
2. Run all backend tests including the full workflow test
3. Create real PRs on GitHub using your credentials
4. Merge the PRs and validate rewards
5. Stop and clean up containers

## Test Commands

### Run All Tests in Docker
```bash
make test-docker
```

### Run Full Workflow Test Locally (without Docker)
```bash
export GITHUB_TOKEN="ghp_your_token"
export TEST_GITHUB_USERNAME="your_username"
make test-full-workflow-local
```

### Run Just the Backend Tests (fast)
```bash
make test-backend
```

### Clean Up Test Environment
```bash
make test-cleanup
```

This removes:
- Test Docker containers
- Test database volumes
- All test data

## What Tests Run?

### In Docker (make test-full-workflow):
1. **Unit Tests** - Fast tests with mocked dependencies
2. **Integration Tests** - Tests with real database
3. **Live Integration Tests** - Tests with real GitHub API (read-only)
4. **Full Workflow Test** - Complete E2E with PR creation and merging

### Local (make test-backend):
- Only unit and integration tests
- No real GitHub calls
- Fast execution (< 2 seconds)

## Architecture

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

**Ports used (to avoid conflicts with dev environment):**
- PostgreSQL: `5433` (instead of 5432)
- Redis: `6380` (instead of 6379)

## Prerequisites

### GitHub Token Requirements

Your `GITHUB_TOKEN` needs:
- ✅ `repo` scope (full repository access)
- ✅ Write access to `nishantg96/git-demo-issues`

### Get Your Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes:
   - ✅ `repo` (Full control of private repositories)
4. Generate and copy the token
5. Paste it in `docker/.env.test`

### Verify Access

Test your credentials:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.github.com/repos/nishantg96/git-demo-issues
```

Should return repo info (not 404).

## Troubleshooting

### "docker/.env.test not found"
```bash
make env-test
# Then edit docker/.env.test with your credentials
```

### "GITHUB_TOKEN not set"
You didn't add your token to `docker/.env.test`:
```bash
echo 'GITHUB_TOKEN=ghp_your_token' >> docker/.env.test
```

### "Failed to create branch: 403"
Your token doesn't have write access:
1. Check token has `repo` scope
2. Verify you're a collaborator on `nishantg96/git-demo-issues`
3. Try the curl test above

### "Port 5433 already in use"
Another test instance is running:
```bash
make test-docker-down
make test-cleanup
```

### Tests pass but no PR was created
Check the test output - the Full Workflow test may have been skipped:
- Needs `GITHUB_TOKEN` and `TEST_GITHUB_USERNAME`
- Runs only if environment variables are set

### "Permission denied" on creds
The test container needs access to Firebase credentials (even though we don't use them):
```bash
chmod +r creds/*.json
```

## Development Workflow

### Before Committing
```bash
make test-backend  # Fast local tests
```

### Before Deploying
```bash
make test-full-workflow  # Complete E2E validation
```

### Debugging a Specific Test
```bash
# Run just the full workflow test
docker compose -f docker/docker-compose.test.yml \
  --env-file docker/.env.test \
  run --rm test-runner \
  go test -v ./internal/handler -run TestFullWorkflow
```

## Safety

✅ **Safe:**
- Tests use isolated database (`gitfable_test`)
- Separate Docker containers
- Different ports than dev environment
- Created PRs are test PRs that get merged

⚠️ **Careful:**
- Tests make REAL changes to the demo repo
- Creates branches and PRs on GitHub
- Cannot be undone (git history)
- Uses real GitHub API quota

🔒 **Security:**
- `.env.test` is in `.gitignore` (never committed)
- Credentials only in Docker container
- Token never logged or printed

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

**Note:** In CI, you might want to skip the Full Workflow test (requires repo write access). Use:

```bash
# Run all tests except full workflow
make test-docker TEST_FLAGS="-run 'Test[^Full]'"
```

## See Also

- [Full Workflow Test Details](FULL_WORKFLOW_TEST.md)
- [Live Integration Tests](LIVE_TESTS.md)
- [Regular E2E Tests](../backend/internal/handler/workflow_e2e_test.go)
