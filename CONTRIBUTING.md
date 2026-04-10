# Contributing

Thanks for contributing to GitFable.

## Before You Start

- Read `README.md` for the project overview and local setup.
- Keep changes scoped. Small, reviewable pull requests are preferred.
- Never commit secrets, personal tokens, populated `.env` files, or generated local credentials.
- If your change affects behavior, add or update tests.

## Local Setup

```bash
make install
make env
make dev
```

You will need local values in `docker/.env` for GitHub OAuth and JWT configuration. See `README.md` for the required variables and local callback URL.

## Workflow

1. Create a branch for your work.
2. Make the smallest change that solves the problem.
3. Update tests and docs when needed.
4. Run the checks that match your change.
5. Open a pull request with a clear summary and verification notes.

## Verification

Run the checks that apply before opening a pull request:

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

See `docs/TESTING.md` for the full testing guide. Maintainer-only tests that use live GitHub resources are documented there separately.

## Pull Requests

Include:

- What changed
- Why it changed
- How you verified it
- Screenshots for UI changes when relevant

## Community Standards

By participating, you agree to follow `CODE_OF_CONDUCT.md`.
