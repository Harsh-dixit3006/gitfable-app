<p align="center">
  <img src="assets/gitfable-logo.png" alt="GitFable" width="200" />
</p>

<h1 align="center">GitFable</h1>

<p align="center">
  <strong>Your open-source origin story starts here.</strong><br />
  Draw issues like cards. Bookmark the ones that call to you. Submit PRs. Earn XP, badges, and a place on the leaderboard.
</p>

<p align="center">
  <a href="https://gitfable.app"><img src="https://img.shields.io/badge/live-gitfable.app-amber?style=flat-square" alt="Live" /></a>
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <a href="https://github.com/nishantg96/gitfable-app/issues"><img src="https://img.shields.io/badge/feedback-welcome-blue?style=flat-square" alt="Feedback" /></a>
</p>

GitFable is a web app that helps developers discover open-source issues through a card-draw mechanic. It syncs GitHub issues, lets users bookmark work as active quests, verifies submitted pull requests, and awards XP, badges, and leaderboard progress for merged contributions.

## Stack

- Backend: Go, Chi, sqlc, PostgreSQL, Redis
- Frontend: React 19, Tailwind CSS, Radix UI, Framer Motion
- Auth: GitHub OAuth with self-issued JWTs

## Quick Start

### Prerequisites

- Go
- Node.js and npm
- Docker and Docker Compose
- tmux

### 1. Install dependencies

```bash
make install
make env
```

### 2. Configure local auth

Create a GitHub OAuth App at `https://github.com/settings/developers` with:

```text
Homepage URL: http://localhost:3000
Authorization callback URL: http://localhost:8001/api/v1/oauth/github/callback
```

Then fill in `docker/.env` with local values for:

- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`
- `GITHUB_OAUTH_CALLBACK_URL`
- `JWT_SECRET`
- `GITHUB_TOKEN`

`FRONTEND_URL` should match the frontend origin, `CORS_ORIGINS` should include that origin, and `REACT_APP_BACKEND_URL` should point at the backend origin.

### 3. Start the app

```bash
make dev
```

Open `http://localhost:3000`.

## Common Commands

```bash
make dev
make dev-stop
make test
make lint
make generate
make migrate-up
make docker-up
make docker-down
```

## Documentation

- Local Docker workflow: `docs/docker-quickstart.md`
- Testing guide: `docs/TESTING.md`
- Contribution guide: `CONTRIBUTING.md`
- Security policy: `SECURITY.md`

## Contributing

Small, focused pull requests are preferred. Before opening a PR, run the checks that match your change and include verification notes.

See `CONTRIBUTING.md` for contributor workflow details.

## Security

Do not report vulnerabilities in public issues. See `SECURITY.md`.

## License

This project is licensed under the MIT License. See `LICENSE`.
