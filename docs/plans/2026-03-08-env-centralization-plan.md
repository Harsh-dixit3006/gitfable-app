# Env Centralization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centralize all environment configuration under `docker/` with a single `.env` as the source of truth for both Docker and local dev.

**Architecture:** Single `docker/.env` file with local dev values (localhost hostnames). Docker compose uses `${VAR}` interpolation and overrides only container-specific hostnames. Makefile sources `.env` for local dev via `set -a`.

**Tech Stack:** Docker Compose, Make, Go (os.Getenv), CRA (REACT_APP_* auto-load)

**Design doc:** `docs/plans/2026-03-08-env-centralization-design.md`

---

### Task 1: Create docker/.env.example

**Files:**
- Create: `docker/.env.example`

**Step 1: Create the example env file**

Create `docker/.env.example` with real public values and placeholder secrets:

```bash
# ─── Environment ──────────────────────────────────────────────────
ENVIRONMENT=development

# ─── Backend ──────────────────────────────────────────────────────
PORT=8001
DATABASE_URL=postgresql://gitfable:gitfable@localhost:5432/gitfable?sslmode=disable
DB_POOL_SIZE=25
REDIS_URL=redis://localhost:6379
RATE_LIMIT_ENABLED=true
CORS_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000

# ─── Firebase (backend) ──────────────────────────────────────────
FIREBASE_SERVICE_ACCOUNT_PATH=your_firebase_service_account_path
FIREBASE_PROJECT_ID=gitfable-app

# ─── Firebase (frontend — REACT_APP_ prefix required by CRA) ────
REACT_APP_BACKEND_URL=http://localhost:8001
REACT_APP_FIREBASE_API_KEY=AIzaSyDRgUUCN6XjWtaknC3AltGdqdnbPrURoAE
REACT_APP_FIREBASE_AUTH_DOMAIN=gitfable-app.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=gitfable-app
REACT_APP_FIREBASE_STORAGE_BUCKET=gitfable-app.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=30932902369
REACT_APP_FIREBASE_APP_ID=1:30932902369:web:cfcb19db92cda374b432a0

# ─── GitHub ──────────────────────────────────────────────────────
GITHUB_TOKEN=your_github_token_here
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here

# ─── Sync ────────────────────────────────────────────────────────
SYNC_ENABLED=true
SYNC_INTERVAL=6h
STALE_INTERVAL=12h
```

**Step 2: Create docker/.env from the user's current config**

Create `docker/.env` with the user's actual values. Copy from `.env.example` and fill in:
- `FIREBASE_SERVICE_ACCOUNT_PATH` from current `backend/.env` (the absolute path to the Firebase creds JSON)
- `GITHUB_TOKEN` from current `backend/.env`
- Leave `GITHUB_WEBHOOK_SECRET` as empty string if not set

To get the current values:
```bash
grep 'FIREBASE_SERVICE_ACCOUNT_PATH' backend/.env
grep 'GITHUB_TOKEN' backend/.env
```

Then create `docker/.env` by copying `docker/.env.example` and replacing the placeholder values with the real ones.

**Step 3: Verify .gitignore coverage**

The existing `.gitignore` already has `*.env` and `*.env.*` with `!*.env.example`. Verify that:
```bash
git check-ignore docker/.env          # should print "docker/.env" (ignored)
git check-ignore docker/.env.prod     # should print "docker/.env.prod" (ignored)
git check-ignore docker/.env.example  # should print nothing (not ignored)
```

**Step 4: Commit**

```bash
git add docker/.env.example
git -c commit.gpgsign=false commit -m "chore: add docker/.env.example as single env source of truth

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 2: Update dev compose to use ${VAR} interpolation

**Files:**
- Modify: `docker/docker-compose.yml`

**Step 1: Rewrite docker/docker-compose.yml**

Replace the full contents with:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: gitfable-postgres
    restart: unless-stopped
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: gitfable
      POSTGRES_PASSWORD: gitfable
      POSTGRES_DB: gitfable
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gitfable -d gitfable"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  redis:
    image: redis:7-alpine
    container_name: gitfable-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile
    container_name: gitfable-backend
    restart: unless-stopped
    ports:
      - "${PORT:-8001}:8001"
    environment:
      - ENVIRONMENT=${ENVIRONMENT:-development}
      - PORT=8001
      - DATABASE_URL=postgresql://gitfable:gitfable@postgres:5432/gitfable?sslmode=disable
      - MIGRATIONS_PATH=/migrations
      - REDIS_URL=redis://redis:6379
      - DB_POOL_SIZE=${DB_POOL_SIZE:-25}
      - CORS_ORIGINS=http://localhost:3000,http://frontend:80
      - FRONTEND_URL=${FRONTEND_URL:-http://localhost:3000}
      - FIREBASE_SERVICE_ACCOUNT_PATH=/creds/firebase.json
      - FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID:-gitfable-app}
      - RATE_LIMIT_ENABLED=${RATE_LIMIT_ENABLED:-true}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
      - SYNC_ENABLED=${SYNC_ENABLED:-true}
      - SYNC_INTERVAL=${SYNC_INTERVAL:-6h}
      - STALE_INTERVAL=${STALE_INTERVAL:-12h}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ../creds:/creds:ro

  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
      args:
        - REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL:-http://localhost:8001}
        - REACT_APP_FIREBASE_API_KEY=${REACT_APP_FIREBASE_API_KEY}
        - REACT_APP_FIREBASE_AUTH_DOMAIN=${REACT_APP_FIREBASE_AUTH_DOMAIN}
        - REACT_APP_FIREBASE_PROJECT_ID=${REACT_APP_FIREBASE_PROJECT_ID}
        - REACT_APP_FIREBASE_STORAGE_BUCKET=${REACT_APP_FIREBASE_STORAGE_BUCKET}
        - REACT_APP_FIREBASE_MESSAGING_SENDER_ID=${REACT_APP_FIREBASE_MESSAGING_SENDER_ID}
        - REACT_APP_FIREBASE_APP_ID=${REACT_APP_FIREBASE_APP_ID}
    container_name: gitfable-frontend
    restart: unless-stopped
    ports:
      - "3000:80"
    depends_on:
      - backend

volumes:
  postgres_data:
  redis_data:
```

Key changes from current:
- Removed `env_file: ../backend/.env` (compose auto-loads `docker/.env`)
- All configurable values use `${VAR}` interpolation with sensible defaults
- Docker-specific overrides hardcoded: `DATABASE_URL` (postgres hostname), `REDIS_URL` (redis hostname), `FIREBASE_SERVICE_ACCOUNT_PATH` (/creds/ mount), `CORS_ORIGINS` (includes frontend container)
- Frontend build args use `${REACT_APP_*}` interpolation from `.env`

**Step 2: Validate config**

```bash
docker compose -f docker/docker-compose.yml config --quiet
```

Expected: exits 0 (`.env` auto-loaded, all vars resolved)

**Step 3: Commit**

```bash
git add docker/docker-compose.yml
git -c commit.gpgsign=false commit -m "chore: update dev compose to use env var interpolation from docker/.env

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 3: Update prod compose to use ${VAR} interpolation

**Files:**
- Modify: `docker/docker-compose.prod.yml`

**Step 1: Update the frontend build args in docker/docker-compose.prod.yml**

The prod compose already uses `${VAR}` interpolation for most things. Update the frontend build args to use `REACT_APP_*` var names (matching the `.env` file) instead of non-prefixed names:

Replace the frontend build args section:

```yaml
  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
      args:
        - REACT_APP_BACKEND_URL=${REACT_APP_BACKEND_URL}
        - REACT_APP_FIREBASE_API_KEY=${REACT_APP_FIREBASE_API_KEY}
        - REACT_APP_FIREBASE_AUTH_DOMAIN=${REACT_APP_FIREBASE_AUTH_DOMAIN}
        - REACT_APP_FIREBASE_PROJECT_ID=${REACT_APP_FIREBASE_PROJECT_ID}
        - REACT_APP_FIREBASE_STORAGE_BUCKET=${REACT_APP_FIREBASE_STORAGE_BUCKET}
        - REACT_APP_FIREBASE_MESSAGING_SENDER_ID=${REACT_APP_FIREBASE_MESSAGING_SENDER_ID}
        - REACT_APP_FIREBASE_APP_ID=${REACT_APP_FIREBASE_APP_ID}
```

This replaces the old non-prefixed names (`${BACKEND_URL}`, `${FIREBASE_API_KEY}`, etc.) with the `REACT_APP_*` names that match `docker/.env`.

Also add backend env vars that come from `.env` interpolation:

```yaml
  backend:
    ...
    environment:
      - ENVIRONMENT=production
      - MIGRATIONS_PATH=/migrations
      - CORS_ORIGINS=${CORS_ORIGINS}
      - FRONTEND_URL=${FRONTEND_URL}
      - FIREBASE_SERVICE_ACCOUNT_PATH=/run/secrets/firebase_service_account
      - RATE_LIMIT_ENABLED=${RATE_LIMIT_ENABLED:-true}
      - GITHUB_WEBHOOK_SECRET=${GITHUB_WEBHOOK_SECRET}
      - SYNC_ENABLED=${SYNC_ENABLED:-true}
      - SYNC_INTERVAL=${SYNC_INTERVAL:-6h}
      - STALE_INTERVAL=${STALE_INTERVAL:-12h}
```

**Step 2: Validate config**

```bash
CORS_ORIGINS=https://gitfable.com FRONTEND_URL=https://gitfable.com REACT_APP_BACKEND_URL=https://api.gitfable.com REACT_APP_FIREBASE_API_KEY=x REACT_APP_FIREBASE_AUTH_DOMAIN=x REACT_APP_FIREBASE_PROJECT_ID=x REACT_APP_FIREBASE_STORAGE_BUCKET=x REACT_APP_FIREBASE_MESSAGING_SENDER_ID=x REACT_APP_FIREBASE_APP_ID=x RATE_LIMIT_ENABLED=true GITHUB_WEBHOOK_SECRET=x SYNC_ENABLED=true SYNC_INTERVAL=6h STALE_INTERVAL=12h docker compose -f docker/docker-compose.prod.yml config --quiet
```

Expected: exits 0

**Step 3: Commit**

```bash
git add docker/docker-compose.prod.yml
git -c commit.gpgsign=false commit -m "chore: align prod compose var names with docker/.env convention

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 4: Update Makefile dev targets to source docker/.env

**Files:**
- Modify: `Makefile:20-29` (dev section)
- Modify: `Makefile:80-85` (env section)

**Step 1: Update the dev targets**

Replace the Development section (lines 20-29) with:

```makefile
# ─── Development ─────────────────────────────────────────────────────

dev: ## Start both backend and frontend (requires two terminals)
	@echo "Run in separate terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

dev-backend: ## Start backend dev server (port 8001)
	@test -f docker/.env || (echo "Error: docker/.env not found. Run 'make env' first." && exit 1)
	@set -a && . docker/.env && set +a && command -v air >/dev/null 2>&1 && (cd backend && air) || (cd backend && go run ./cmd/server)

dev-frontend: ## Start frontend dev server (port 3000)
	@test -f docker/.env || (echo "Error: docker/.env not found. Run 'make env' first." && exit 1)
	@set -a && . docker/.env && set +a && cd frontend && npm start
```

**Step 2: Update the env target**

Replace the Environment Setup section (lines 80-85) with:

```makefile
# ─── Environment Setup ───────────────────────────────────────────────

env: ## Create docker/.env from example
	@test -f docker/.env || (cp docker/.env.example docker/.env && echo "Created docker/.env from example")
	@echo "Edit docker/.env with your local values (Firebase path, GitHub token)"
```

**Step 3: Verify make help output**

```bash
make help
```

Expected: `dev-backend`, `dev-frontend`, `env` targets show with updated descriptions.

**Step 4: Commit**

```bash
git add Makefile
git -c commit.gpgsign=false commit -m "chore: update Makefile to source docker/.env for local dev

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 5: Delete old service-level .env files

**Files:**
- Delete: `backend/.env`
- Delete: `backend/.env.example`
- Delete: `frontend/.env`
- Delete: `frontend/.env.example`

**Step 1: Remove the files**

```bash
rm backend/.env frontend/.env
git rm backend/.env.example frontend/.env.example
```

Note: `backend/.env` and `frontend/.env` are gitignored, so just `rm`. The `.env.example` files are tracked, so `git rm`.

**Step 2: Commit**

```bash
git -c commit.gpgsign=false commit -m "chore: remove service-level .env files (replaced by docker/.env)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 6: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md:90-97` (Environment section)

**Step 1: Update the Environment section**

Replace the Environment section (starting at line 90) with:

```markdown
## Environment

All environment config lives in `docker/.env` (single source of truth). Run `make env` to create it from `docker/.env.example`.

**Local dev:** `make dev-backend` and `make dev-frontend` auto-source `docker/.env` before running. No manual env setup needed after `make env`.

**Docker:** `docker compose` auto-loads `docker/.env` from its directory. Dev compose overrides only container-specific hostnames (DATABASE_URL uses `postgres:5432`, REDIS_URL uses `redis:6379`).

**Prod:** Uses `docker/.env.prod` (not committed). Sensitive values use Docker secrets in `docker/secrets/`.

**Required secrets** (must be filled in `docker/.env` after `make env`):
- `FIREBASE_SERVICE_ACCOUNT_PATH` — absolute path to Firebase service account JSON
- `GITHUB_TOKEN` — GitHub PAT for issue sync

**Note:** The Go backend uses `os.Getenv` only — it does not auto-load `.env` files. The Makefile handles sourcing via `set -a`.
```

**Step 2: Commit**

```bash
git add CLAUDE.md
git -c commit.gpgsign=false commit -m "docs: update CLAUDE.md environment section for centralized docker/.env

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

### Task 7: Verify end-to-end

**Step 1: Verify docker/.env exists and is gitignored**

```bash
test -f docker/.env && echo "OK: docker/.env exists" || echo "FAIL: docker/.env missing"
git check-ignore docker/.env && echo "OK: gitignored" || echo "FAIL: not gitignored"
```

**Step 2: Validate dev compose loads from .env**

```bash
docker compose -f docker/docker-compose.yml config --quiet
```

Expected: exits 0

**Step 3: Validate Makefile env target**

```bash
rm -f docker/.env && make env && test -f docker/.env && echo "OK: make env works"
```

Then restore the real `.env` by copying the user's actual values back.

**Step 4: Validate local dev sourcing**

```bash
set -a && . docker/.env && set +a && echo "DATABASE_URL=$DATABASE_URL" && echo "REACT_APP_FIREBASE_API_KEY=$REACT_APP_FIREBASE_API_KEY"
```

Expected: both vars printed with correct values from `docker/.env`.

**Step 5: No commit (verification only)**
