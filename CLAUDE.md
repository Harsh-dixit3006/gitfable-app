# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is GitFable

Gamified web app that matches developers with open-source "good first issues" through a card-draw mechanic. Users draw issues, bookmark them, submit PRs, and earn XP, badges, and leaderboard rankings.

## Commands

```bash
# Install all dependencies
make install              # go mod download (backend) + npm install (frontend)

# Development (one command)
make dev                  # starts postgres+redis in Docker, backend+frontend in tmux split
make dev-stop             # stops everything (tmux + Docker)

# Development (manual, separate terminals)
make dev-backend          # Go server on :8001 (air hot-reload or go run)
make dev-frontend         # React on :3000 (npm start via craco)

# Docker (full stack in containers)
make docker-up            # docker compose -f docker/docker-compose.yml up -d
make docker-down          # stop all services
make docker-logs          # tail all service logs

# Testing
make test                 # runs backend tests
cd backend && go test ./... -v                    # verbose
cd backend && go test ./internal/service/ -v      # single package
cd backend && go test ./internal/service/ -run TestCalcLevel -v  # single test

# Code generation (after changing SQL queries)
make generate             # sqlc generate

# Database migrations
make migrate-up           # apply migrations
make migrate-down         # roll back last migration

# Linting
make lint                 # golangci-lint (backend) + ESLint (frontend)

# Build
make build-backend        # go build -o bin/server ./cmd/server

# Issue sync (fetches GitHub issues into DB)
make sync-issues          # one-time sync via cmd/sync
make build-sync           # build sync CLI binary
```

## Architecture

**Backend:** Go (Chi router) with sqlc-generated type-safe queries over pgx/PostgreSQL. Auth via Firebase Admin SDK for Go. Redis for rate limiting with in-memory fallback. Entry point: `backend/cmd/server/main.go`.

**Frontend:** React 19 (CRA + CRACO) with Tailwind CSS, Shadcn/Radix UI components, Framer Motion. Uses `@` path alias mapped to `src/`. Auth state managed in `AuthContext` which wraps Firebase client SDK. API calls use axios with Bearer token from Firebase.

**Auth flow:** Frontend authenticates via Firebase (GitHub OAuth popup) -> gets Firebase ID token -> sends as `Authorization: Bearer <token>` -> backend verifies with Firebase Admin SDK -> looks up user by `firebase_uid` in PostgreSQL.

**API:** All endpoints under `/api/v1/`. Standard JSON envelope: `{"data": ..., "meta": {...}, "error": null}`. Cursor-based pagination on all list endpoints. Machine-readable error codes.

### Backend structure (`backend/`)
- `cmd/server/main.go` - Entry point, wires all dependencies, Chi router setup, graceful shutdown
- `cmd/sync/main.go` - CLI tool to sync GitHub issues into the database
- `internal/handler/` - HTTP handlers: auth, draws, users, public, webhooks, health
- `internal/service/` - Business logic: xp, badges, streaks, github (PR verification)
- `internal/middleware/` - Request ID, security headers, rate limiting, auth, logging, request size
- `internal/database/` - sqlc-generated query functions and model structs
- `internal/config/` - Env var loading and validation
- `internal/firebase/` - Firebase Admin SDK wrapper
- `internal/redis/` - Redis client with nil fallback
- `internal/ctxutil/` - Shared context helpers (user from context)
- `internal/seed/` - Mock data seeding (runs in dev on startup)
- `sql/migrations/` - golang-migrate SQL migration files
- `sql/queries/` - sqlc query definitions (users, issues, draws, badges, activities, events)
- `sqlc.yaml` - sqlc code generation config

### Frontend structure
- `src/pages/` - Route pages: Landing, Discover, Dashboard, Leaderboard, History, Profile
- `src/components/ui/` - Shadcn UI component library
- `src/contexts/AuthContext.js` - Firebase auth state, token management, API helper
- `src/lib/firebase.js` - Firebase client SDK initialization

### Key patterns
- **sqlc workflow:** Write SQL in `sql/queries/*.sql` -> run `sqlc generate` -> type-safe Go code in `internal/database/`
- **DB IDs:** Internal `BIGSERIAL` PKs, `UUID` public_ids exposed in API. Never leak internal IDs.
- **Handler pattern:** Struct with dependencies, `Routes() chi.Router` method, auth middleware applied per-group
- **Transactions:** Multi-step operations (merge -> XP -> streak -> badges -> activity) use explicit `pgx.Tx` via `queries.WithTx(tx)`
- **Service interfaces:** Services define store interfaces consumed by the service, satisfied implicitly by `*database.Queries`
- **Import cycle fix:** `ctxutil` package provides shared context key between handler and middleware packages
- Non-production environments auto-seed mock data on startup
- Frontend imports use `@/` alias (e.g., `import Foo from "@/components/Foo"`)

## Environment

All environment config lives in `docker/.env` (single source of truth). Run `make env` to create it from `docker/.env.example`.

**Local dev:** `make dev-backend` and `make dev-frontend` auto-source `docker/.env` before running. No manual env setup needed after `make env`.

**Docker:** Compose files live under `docker/`. Dev: `docker/docker-compose.yml`. Prod: `docker/docker-compose.prod.yml`. Compose auto-loads `docker/.env` from its directory. Dev compose overrides only container-specific hostnames (DATABASE_URL uses `postgres:5432`, REDIS_URL uses `redis:6379`).

**Prod:** Uses `docker/.env.prod` (not committed). Sensitive values use Docker secrets in `docker/secrets/`.

**Required secrets** (fill in `docker/.env` after `make env`): `FIREBASE_SERVICE_ACCOUNT_PATH` (absolute path to Firebase service account JSON), `GITHUB_TOKEN` (GitHub PAT for issue sync).

**Note:** The Go backend uses `os.Getenv` only — it does not auto-load `.env` files. The Makefile handles sourcing via `set -a`.
