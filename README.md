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
  <img src="https://img.shields.io/badge/Go-1.25-00ADD8?style=flat-square&logo=go&logoColor=white" alt="Go" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker" />
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License" />
  <a href="https://github.com/nishantg96/gitfable-issues/issues"><img src="https://img.shields.io/badge/feedback-welcome-blue?style=flat-square" alt="Feedback" /></a>
</p>

---

## What is GitFable?

GitFable turns open-source contributions into a game. It syncs thousands of "good first issues" from popular repositories on GitHub, wraps them in a card-draw mechanic with rarity tiers, and rewards you for actually shipping pull requests.

**The loop:** Draw a card &rarr; Bookmark it &rarr; Submit a PR &rarr; Get it merged &rarr; Earn XP and badges &rarr; Climb the leaderboard.

## How It Works

### Draw or Browse

Every day you get a limited number of random draws. Each card has a rarity tier — Common, Rare, Epic, or Legendary — based on the repository's star count. Higher rarity means higher XP on merge. You can also browse the full issue catalog and choose directly (no draw cost).

### Bookmark and Track

Bookmark up to 5 issues at a time. Each bookmark lasts 7 days. The dashboard shows your active work, recent draws, streaks, and progress toward badges.

### Submit and Verify

Link your pull request to a bookmarked issue. GitFable verifies the PR against GitHub's API — checking authorship, repo match, and issue references. When your PR is merged (detected automatically via webhook or manual verify), you earn rarity-based XP.

### Earn and Compete

10 narrative-themed badges track your journey: from **Prologue** (first merge) to **The Epic** (100 merges), **Midnight Draft** (merging at 3am), and **Worldbuilder** (contributing to 10+ repos). XP drives your level (500 XP per level) and leaderboard ranking.

## Getting Started

### Prerequisites

- Go 1.25+
- Node.js 20+
- Docker and Docker Compose (for PostgreSQL and Redis)
- A [GitHub OAuth App](https://github.com/settings/developers) (callback URL: `http://localhost:8001/api/v1/oauth/github/callback`)

### Setup

```bash
# Clone and install dependencies
make install

# Create environment file
make env
```

Edit `docker/.env` and fill in:

```
GITHUB_OAUTH_CLIENT_ID=your_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
JWT_SECRET=generate_with_openssl_rand_base64_32
GITHUB_TOKEN=your_github_pat
```

### Run

```bash
# Start everything (postgres, redis, backend, frontend) in a tmux session
make dev
```

Or manually in separate terminals:

```bash
make dev-backend   # Go server on :8001
make dev-frontend  # React on :3000
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

```
backend/
  cmd/server/          Entry point, dependency wiring, Chi router
  cmd/sync/            CLI for one-time GitHub issue sync
  internal/
    auth/              JWT signing/verification, GitHub OAuth client
    handler/           HTTP handlers (auth, draws, users, public, webhooks, oauth)
    service/           Business logic (XP, badges, streaks, merge, GitHub PR client)
    middleware/        Auth, rate limiting, logging, security headers
    database/          sqlc-generated type-safe queries
    config/            Environment variable loading
    sync/              Background issue sync from GitHub GraphQL API
  sql/
    migrations/        golang-migrate SQL migration files
    queries/           sqlc query definitions

frontend/
  src/
    pages/             Landing, Discover, Dashboard, Leaderboard, History, Profile, Settings
    components/        Navbar, DrawAnimation, IssueCardRow, RequireAuth, Shadcn UI
    contexts/          AuthContext (GitHub OAuth, JWT token management)
    lib/               API client, theme system

docker/                Docker Compose configs (local, dev VPS, prod VPS)
scripts/               deploy.sh, provision.sh, backup-db.sh, dev.sh
```

## API

All endpoints under `/api/v1`. JSON envelope: `{"data": ..., "meta": {...}, "error": null}`.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | No | Health check |
| GET | `/ready` | No | Readiness (DB + Redis) |
| GET | `/oauth/github` | No | Start GitHub OAuth flow |
| GET | `/oauth/github/callback` | No | OAuth callback |
| POST | `/oauth/refresh` | No | Refresh JWT token pair |
| POST | `/auth/register` | Reg | Register with username |
| GET | `/auth/me` | Yes | Current user profile |
| PUT | `/auth/me` | Yes | Update display name / avatar |
| POST | `/draws` | Yes | Random card draw |
| POST | `/draws/choose` | Yes | Choose specific issue |
| PUT | `/draws/{id}/status` | Yes | Bookmark, expire, abandon |
| PUT | `/draws/{id}/pr` | Yes | Submit PR URL |
| POST | `/draws/{id}/verify` | Yes | Verify PR merge |
| POST | `/draws/{id}/reactivate` | Yes | Reactivate expired bookmark |
| GET | `/draws/history` | Yes | Draw history (paginated) |
| GET | `/users/dashboard` | Yes | Dashboard data |
| PUT | `/users/filters` | Yes | Update issue filters |
| GET | `/users/{username}` | No | Public profile |
| GET | `/issues` | No | Browse issues (paginated) |
| GET | `/leaderboard` | No | Leaderboard (paginated) |
| GET | `/stats` | No | Platform stats |
| GET | `/activity` | No | Recent activity feed |
| POST | `/webhooks/github` | HMAC | PR merge webhook |

## Development

```bash
make dev              # Start everything in tmux
make dev-stop         # Stop all services
make test             # Run backend tests
make lint             # Lint backend + frontend
make generate         # Regenerate sqlc code after SQL changes
make migrate-up       # Apply database migrations
make migrate-down     # Roll back last migration
make build-backend    # Build Go binary
make docker-up        # Run full stack in Docker
```

### Database Changes

1. Write SQL in `sql/queries/*.sql`
2. Run `make generate` to regenerate Go code
3. For schema changes, create a migration: `migrate create -ext sql -dir backend/sql/migrations -seq name`
4. Apply with `make migrate-up`

## Deployment

GitFable deploys to a self-hosted VPS with Docker Compose and Caddy for auto-SSL.

- **Push to `devel`** &rarr; auto-deploys to `dev.gitfable.app`
- **Push to `main`** &rarr; deploys to `gitfable.app`
- **Tag `v*`** &rarr; creates GitHub Release + deploys to prod

CI pipeline: test &rarr; build Docker images &rarr; push to GHCR &rarr; deploy via self-hosted runner &rarr; run migrations &rarr; smoke test &rarr; Discord notification.

See `docs/ops/DEPLOYMENT_RUNBOOK.md` for the full runbook.

## Feedback

Found a bug or have an idea? [Open an issue](https://github.com/nishantg96/gitfable-app/issues).

## License

MIT
