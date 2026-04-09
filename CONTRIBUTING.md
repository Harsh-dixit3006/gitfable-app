# Contributing

Thanks for contributing to GitFable.

## Before You Start

- Read `README.md` for the project overview and local setup.
- Use the issue tracker for bugs and feature requests.
- Keep changes scoped. Small, reviewable pull requests are preferred.
- Never commit secrets, personal tokens, or populated `.env` files.

## Local Setup

```bash
make install
make env
```

Fill in `docker/.env` with your local values:

- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`
- `JWT_SECRET`
- `GITHUB_TOKEN`

Then start the app:

```bash
make dev
```

## Development Workflow

1. Create a branch for your work.
2. Make the smallest change that solves the problem.
3. Add or update tests when behavior changes.
4. Update docs when setup, workflows, or APIs change.
5. Open a pull request with a clear summary and verification notes.

## Verification

Run the checks that match your change before opening a pull request:

```bash
make test
make lint
cd frontend && npm test -- --watchAll=false
cd frontend && CI=true npm run build
```

For Docker-based workflow tests:

```bash
make env-test
make test-docker
```

## Pull Requests

Include:

- What changed
- Why it changed
- How you verified it
- Screenshots for UI changes when relevant

## Community Standards

By participating, you agree to follow `CODE_OF_CONDUCT.md`.
