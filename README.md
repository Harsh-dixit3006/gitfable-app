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

---

GitFable turns open-source contributions into a game. It syncs "good first issues" from popular GitHub repositories, wraps them in a card-draw mechanic with rarity tiers, and rewards you for shipping pull requests with XP, badges, and leaderboard rankings.

## How It Works

1. **Draw** — Each day you get random card draws. Issues are tiered by repo popularity: Common, Rare, Epic, or Legendary. You can also browse and pick directly.
2. **Bookmark** — Save up to 5 issues at a time. Each bookmark lasts 7 days. Your dashboard tracks active work, streaks, and badge progress.
3. **Submit** — Link a PR to a bookmarked issue. GitFable verifies authorship, repo match, and merge status against the GitHub API.
4. **Earn** — Merged PRs grant rarity-based XP (25–500 per issue). 10 narrative badges mark milestones from your first merge to contributing across 10+ repos. XP drives your level and leaderboard rank.

## Tech Stack

- **Backend:** Go, Chi router, sqlc, PostgreSQL, Redis
- **Frontend:** React 19, Tailwind CSS, Shadcn/Radix UI, Framer Motion
- **Auth:** GitHub OAuth with self-issued JWT
- **Infra:** Docker Compose, Caddy, GitHub Actions CI/CD

## Quick Start

```bash
make install          # Install Go + Node dependencies
make env              # Create docker/.env from template
```

Fill in your GitHub OAuth credentials in `docker/.env` (see [docs/github-oauth-setup.md](docs/github-oauth-setup.md)), then:

```bash
make dev              # Starts Postgres, Redis, backend, and frontend in tmux
```

Open [http://localhost:3000](http://localhost:3000).

## Development

```bash
make dev              # Start everything
make dev-stop         # Stop all services
make test             # Run backend tests
make lint             # Lint backend + frontend
make generate         # Regenerate sqlc code after SQL changes
make migrate-up       # Apply database migrations
make docker-up        # Run full stack in Docker
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Report vulnerabilities via [SECURITY.md](SECURITY.md), not public issues.

## License

[MIT](LICENSE)
