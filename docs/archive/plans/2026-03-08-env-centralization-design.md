# Environment Configuration Centralization

## Goal

Centralize all environment configuration under `docker/` with a single `.env` file as the source of truth for both Docker and local dev workflows.

## File Structure

```
docker/
├── .env                    # Gitignored. Single source of truth for all config.
├── .env.example            # Committed. Real public values + placeholder secrets.
├── .env.prod               # Gitignored. Prod overrides.
├── docker-compose.yml      # Uses ${VAR} interpolation from .env
├── docker-compose.prod.yml # Uses ${VAR} interpolation from .env.prod
├── nginx/
│   └── proxy.conf
└── secrets/
    └── .gitkeep
```

## `docker/.env` Layout

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
FIREBASE_SERVICE_ACCOUNT_PATH=/home/you/path/to/creds/firebase.json
FIREBASE_PROJECT_ID=gitfable-app

# ─── Firebase (frontend — REACT_APP_ prefix required by CRA) ────
REACT_APP_BACKEND_URL=http://localhost:8001
REACT_APP_FIREBASE_API_KEY=AIzaSyDRgUUCN6XjWtaknC3AltGdqdnbPrURoAE
REACT_APP_FIREBASE_AUTH_DOMAIN=gitfable-app.firebaseapp.com
REACT_APP_FIREBASE_PROJECT_ID=gitfable-app
REACT_APP_FIREBASE_STORAGE_BUCKET=gitfable-app.firebasestorage.app
REACT_APP_FIREBASE_MESSAGING_SENDER_ID=30932902369
REACT_APP_FIREBASE_APP_ID=1:30932902369:web:cfcb19db92cda374b432a0

# ─── Secrets (placeholder in .env.example) ────────────────────────
GITHUB_TOKEN=your_github_token_here
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
```

`.env.example` is identical but with placeholder values for secrets.

## How Each Consumer Uses It

### Docker Compose (dev)

Auto-loads `docker/.env` (compose loads `.env` from its own directory). Uses `${VAR}` interpolation everywhere. Only overrides Docker-specific values where container hostnames differ from localhost:

```yaml
backend:
  environment:
    - DATABASE_URL=postgresql://gitfable:gitfable@postgres:5432/gitfable?sslmode=disable
    - REDIS_URL=redis://redis:6379
    - FIREBASE_SERVICE_ACCOUNT_PATH=/creds/firebase.json
    - CORS_ORIGINS=http://localhost:3000,http://frontend:80
  # All other vars (GITHUB_TOKEN, etc.) flow from .env via ${VAR} interpolation
```

### Local Dev (Makefile)

Sources `docker/.env` before running the service:

```makefile
dev-backend:
	set -a && . docker/.env && set +a && cd backend && go run ./cmd/server

dev-frontend:
	set -a && . docker/.env && set +a && cd frontend && npm start
```

`set -a` exports all vars so `os.Getenv` (Go) and CRA (React) both pick them up.

### Docker Compose (prod)

Uses `docker/.env.prod` (auto-loaded or via `--env-file`). Secrets stay in `docker/secrets/` as files mounted via Docker secrets.

## Changes

### Files deleted
- `backend/.env` — replaced by `docker/.env`
- `backend/.env.example` — replaced by `docker/.env.example`
- `frontend/.env` — replaced by `docker/.env`
- `frontend/.env.example` — replaced by `docker/.env.example`

### Files created
- `docker/.env.example` — committed template with real public values + secret placeholders
- `docker/.env` — gitignored, user copies from example

### Files modified
- `docker/docker-compose.yml` — remove `env_file`, use `${VAR}` interpolation, override only container hostnames
- `docker/docker-compose.prod.yml` — same pattern with prod vars
- `Makefile` — `dev-backend`/`dev-frontend` source `docker/.env`; `env` target updated
- `CLAUDE.md` — updated environment docs
- `.gitignore` — add `docker/.env`, `docker/.env.prod`

## Design Decisions

1. **Single file, not per-service** — backend and frontend share Firebase config. One file avoids duplication.
2. **Local dev values as default** — `docker/.env` uses `localhost` hostnames. Docker compose overrides only what differs (container hostnames). This matches the primary workflow (Docker for infra, direct run for app).
3. **REACT_APP_ prefix in shared .env** — CRA requires this prefix. Keeping both prefixed (frontend) and non-prefixed (backend) vars in one file avoids needing a translation layer.
4. **Makefile sources .env** — `set -a && . docker/.env && set +a` is a standard POSIX pattern. No extra tooling (direnv, dotenv loader) needed.
5. **Real public values in .env.example** — Firebase public config isn't secret. This makes the example work out of the box after adding only secrets.
