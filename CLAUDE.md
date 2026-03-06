# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is GitFable

Gamified web app that matches developers with open-source "good first issues" through a card-draw mechanic. Users draw issues, bookmark them, submit PRs, and earn XP, badges, and leaderboard rankings.

## Commands

```bash
# Install all dependencies
make install              # runs uv sync (backend) + yarn install (frontend)

# Development servers (run in separate terminals)
make dev-backend          # FastAPI on :8001 (uvicorn with --reload)
make dev-frontend         # React on :3000 (craco start)

# Docker (starts postgres, redis, backend, frontend)
make docker-up            # docker compose up -d
make docker-down          # stop all services
make docker-logs          # tail all service logs

# Testing
make test                 # runs backend tests only
cd backend && uv run pytest tests/ -v                # verbose backend tests
cd backend && uv run pytest tests/test_foo.py -v     # single test file
cd backend && uv run pytest tests/test_foo.py::test_bar -v  # single test

# Linting
make lint                 # ESLint on frontend/src

# Add Python dependency
make add PKG=package-name
```

## Architecture

**Backend:** FastAPI (async) with SQLAlchemy async ORM on PostgreSQL. Auth via Firebase Admin SDK (verifies ID tokens). Redis for rate limiting (falls back to local if unavailable). Entry point: `backend/app/main.py`.

**Frontend:** React 19 (CRA + CRACO) with Tailwind CSS, Shadcn/Radix UI components, Framer Motion. Uses `@` path alias mapped to `src/`. Auth state managed in `AuthContext` which wraps Firebase client SDK. API calls use axios with Bearer token from Firebase.

**Auth flow:** Frontend authenticates via Firebase (GitHub OAuth popup) -> gets Firebase ID token -> sends as `Authorization: Bearer <token>` -> backend verifies with Firebase Admin SDK -> looks up user by `firebase_uid` in PostgreSQL.

### Backend structure
- `app/routes/` - API route handlers: auth, draws, users, public, webhooks
- `app/services/` - Business logic: auth, badges, draws, github_pr, streaks, xp
- `app/models/database.py` - SQLAlchemy ORM models (Base declarative)
- `app/models/requests.py` - Pydantic request/response models
- `app/middleware/` - Rate limiting, security headers
- `app/config.py` - All env var loading, uses dotenv from `backend/.env`
- `app/database.py` - Async SQLAlchemy engine + session factory (`AsyncSessionLocal`)
- `app/seed.py` - Mock data seeding (runs automatically in dev on startup)

### Frontend structure
- `src/pages/` - Route pages: Landing, Discover, Dashboard, Leaderboard, History, Profile
- `src/components/ui/` - Shadcn UI component library
- `src/contexts/AuthContext.js` - Firebase auth state, token management, API helper
- `src/lib/firebase.js` - Firebase client SDK initialization

### Key patterns
- Backend DB sessions: use `get_db()` async generator as FastAPI dependency
- Tables auto-created on startup via `Base.metadata.create_all`; indexes created in `database_indexes.py`
- Non-production environments auto-seed mock data on startup
- Frontend imports use `@/` alias (e.g., `import Foo from "@/components/Foo"`)

## Environment

Backend `.env` requires: `DATABASE_URL`, Firebase credentials (either `FIREBASE_SERVICE_ACCOUNT_PATH` or individual `FIREBASE_*` vars), `CORS_ORIGINS`. See `backend/.env.example`.

Frontend `.env` requires: `REACT_APP_BACKEND_URL`, `REACT_APP_FIREBASE_*` config vars. See `frontend/.env.example`.

Docker compose provides postgres (5432), redis (6379), and wires `DATABASE_URL` + `REDIS_URL` automatically.
