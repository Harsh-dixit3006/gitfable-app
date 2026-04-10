# Testing Guide

This guide covers the public contributor testing workflow for GitFable.

> Maintainer note: live GitHub API tests and full workflow tests are maintainer-only. They touch external GitHub state and are not part of the normal contributor workflow.

## Recommended Commands

```bash
make test
make lint
cd frontend && npm test -- --watchAll=false
cd frontend && CI=true npm run build
```

For Docker-based local tests:

```bash
make env-test
make test-docker
```

## Test Types

### Unit and integration tests

- Fastest feedback loop for normal development
- Covers backend handlers, services, middleware, and related logic
- Primary command: `make test`

### Frontend tests

- Run from `frontend/`
- Use for UI and client-side behavior changes

```bash
cd frontend && npm test -- --watchAll=false
cd frontend && CI=true npm run build
```

### Docker-based tests

- Uses a separate local test stack
- Good for validating workflow behavior without touching your normal dev environment

```bash
make env-test
make test-docker
```

`docker/.env.test.example` is the committed template. `docker/.env.test` stays local and must never be committed.

## Common Commands

```bash
cd backend && go test ./...
go test -v ./internal/handler -run TestDraw
go test -v ./internal/handler -run "TestComplete.*"
make test-cleanup
```

## Troubleshooting

### Test environment file missing

```bash
make env-test
```

### Docker test stack already running or ports in use

```bash
make test-docker-down
make test-cleanup
```

### Frontend test or build failures

```bash
cd frontend && npm test -- --watchAll=false
cd frontend && CI=true npm run build
```

## Maintainer-Only Tests

The repository also includes tests that use real GitHub resources.

- Live GitHub API tests use real GitHub data.
- Full workflow tests create real branches, pull requests, merges, and commits in a maintainer-controlled repository.

They are opt-in and require explicit environment variables such as:

- `LIVE_TEST_REPO`
- `LIVE_TEST_ISSUE_NUMBERS`
- `LIVE_TEST_PR_NUMBER`
- `FULL_WORKFLOW_TEST_REPO`
- `TEST_GITHUB_USERNAME`

Only run those flows if you intentionally have the required access and understand the side effects.
