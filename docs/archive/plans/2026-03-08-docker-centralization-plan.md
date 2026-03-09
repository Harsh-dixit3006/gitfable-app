# Docker Centralization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Move Docker orchestration files under `docker/`, clean up stale Python-era references, and rewrite prod compose for the current Go/PostgreSQL stack.

**Architecture:** All compose files and supporting configs (nginx proxy, secrets placeholder) live under `docker/`. Dockerfiles stay in their service directories (`backend/`, `frontend/`) since they need build context access. Compose build contexts use `../backend` and `../frontend` relative paths.

**Tech Stack:** Docker Compose, nginx, PostgreSQL, Redis

**Design doc:** `docs/plans/2026-03-08-docker-centralization-design.md`

---

### Task 1: Create docker/ directory structure

**Files:**
- Create: `docker/secrets/.gitkeep`
- Create: `docker/nginx/proxy.conf`

**Step 1: Create directories and placeholder files**

```bash
mkdir -p docker/nginx docker/secrets
touch docker/secrets/.gitkeep
```

**Step 2: Create the prod nginx reverse proxy config**

Create `docker/nginx/proxy.conf`:

```nginx
upstream frontend {
    server frontend:80;
}

upstream backend {
    server backend:8001;
}

server {
    listen 80;
    server_name _;

    location /api/ {
        proxy_pass http://backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

**Step 3: Commit**

```bash
git add docker/
git commit -m "chore: create docker/ directory structure with nginx proxy config and secrets placeholder"
```

---

### Task 2: Move and update dev compose file

**Files:**
- Move: `docker-compose.yml` -> `docker/docker-compose.yml`
- Delete: `docker-compose.yml` (after move)

**Step 1: Move the file**

```bash
git mv docker-compose.yml docker/docker-compose.yml
```

**Step 2: Update docker/docker-compose.yml**

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
      - "8001:8001"
    environment:
      - DATABASE_URL=postgresql://gitfable:gitfable@postgres:5432/gitfable?sslmode=disable
      - MIGRATIONS_PATH=/migrations
      - REDIS_URL=redis://redis:6379
      - CORS_ORIGINS=http://localhost:3000,http://frontend:80
      - ENVIRONMENT=development
      - FIREBASE_SERVICE_ACCOUNT_PATH=/creds/gitfable-app-firebase-adminsdk-fbsvc-1faf6f92c5.json
    env_file:
      - ../backend/.env
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
        - REACT_APP_BACKEND_URL=http://localhost:8001
        - REACT_APP_FIREBASE_API_KEY=AIzaSyDRgUUCN6XjWtaknC3AltGdqdnbPrURoAE
        - REACT_APP_FIREBASE_AUTH_DOMAIN=gitfable-app.firebaseapp.com
        - REACT_APP_FIREBASE_PROJECT_ID=gitfable-app
        - REACT_APP_FIREBASE_STORAGE_BUCKET=gitfable-app.firebasestorage.app
        - REACT_APP_FIREBASE_MESSAGING_SENDER_ID=30932902369
        - REACT_APP_FIREBASE_APP_ID=1:30932902369:web:cfcb19db92cda374b432a0
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

Changes from original:
- Removed `version: '3.8'` (deprecated)
- `context: ./backend` -> `context: ../backend`
- `context: ./frontend` -> `context: ../frontend`
- `env_file: ./backend/.env` -> `env_file: ../backend/.env`
- `./creds:/creds:ro` -> `../creds:/creds:ro`

**Step 3: Commit**

```bash
git add docker/docker-compose.yml
git commit -m "chore: move dev compose to docker/ and update relative paths"
```

---

### Task 3: Rewrite and move prod compose file

**Files:**
- Move: `docker-compose.prod.yml` -> `docker/docker-compose.prod.yml`
- Delete: `docker-compose.prod.yml` (after move)

**Step 1: Move the file**

```bash
git mv docker-compose.prod.yml docker/docker-compose.prod.yml
```

**Step 2: Rewrite docker/docker-compose.prod.yml**

Replace the full contents with (rewritten for Go/PostgreSQL stack):

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: gitfable-postgres-prod
    restart: always
    environment:
      POSTGRES_USER_FILE: /run/secrets/postgres_user
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
      POSTGRES_DB: gitfable
    volumes:
      - postgres_data:/var/lib/postgresql/data
    secrets:
      - postgres_user
      - postgres_password
    networks:
      - gitfable-network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -d gitfable"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  redis:
    image: redis:7-alpine
    container_name: gitfable-redis-prod
    restart: always
    command: redis-server --requirepass $$(cat /run/secrets/redis_password)
    volumes:
      - redis_data:/data
    secrets:
      - redis_password
    networks:
      - gitfable-network
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "$$(cat /run/secrets/redis_password)", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  backend:
    build:
      context: ../backend
      dockerfile: Dockerfile
    container_name: gitfable-backend-prod
    restart: always
    environment:
      - ENVIRONMENT=production
      - MIGRATIONS_PATH=/migrations
      - CORS_ORIGINS=${CORS_ORIGINS}
      - FIREBASE_SERVICE_ACCOUNT_PATH=/run/secrets/firebase_service_account
    secrets:
      - database_url
      - redis_url
      - firebase_service_account
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - gitfable-network
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.25'
          memory: 256M

  frontend:
    build:
      context: ../frontend
      dockerfile: Dockerfile
      args:
        - REACT_APP_BACKEND_URL=${BACKEND_URL}
        - REACT_APP_FIREBASE_API_KEY=${FIREBASE_API_KEY}
        - REACT_APP_FIREBASE_AUTH_DOMAIN=${FIREBASE_AUTH_DOMAIN}
        - REACT_APP_FIREBASE_PROJECT_ID=${FIREBASE_PROJECT_ID}
        - REACT_APP_FIREBASE_STORAGE_BUCKET=${FIREBASE_STORAGE_BUCKET}
        - REACT_APP_FIREBASE_MESSAGING_SENDER_ID=${FIREBASE_MESSAGING_SENDER_ID}
        - REACT_APP_FIREBASE_APP_ID=${FIREBASE_APP_ID}
    container_name: gitfable-frontend-prod
    restart: always
    depends_on:
      - backend
    networks:
      - gitfable-network
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 256M

  nginx:
    image: nginx:alpine
    container_name: gitfable-nginx
    restart: always
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/proxy.conf:/etc/nginx/conf.d/default.conf:ro
    depends_on:
      - frontend
      - backend
    networks:
      - gitfable-network

volumes:
  postgres_data:
  redis_data:

networks:
  gitfable-network:
    driver: bridge

secrets:
  postgres_user:
    file: ./secrets/postgres_user.txt
  postgres_password:
    file: ./secrets/postgres_password.txt
  database_url:
    file: ./secrets/database_url.txt
  redis_password:
    file: ./secrets/redis_password.txt
  redis_url:
    file: ./secrets/redis_url.txt
  firebase_service_account:
    file: ./secrets/firebase_service_account.json
```

Key changes from old prod compose:
- MongoDB replaced with PostgreSQL 16
- All secret names updated for PostgreSQL (`postgres_user`, `postgres_password`, `database_url`)
- `mongo-init.js` reference removed
- Backend env vars updated for Go server (`DATABASE_URL`, `MIGRATIONS_PATH`, `FIREBASE_SERVICE_ACCOUNT_PATH`)
- Frontend build args include all Firebase config via env vars
- Nginx volume points to `./nginx/proxy.conf` (relative to `docker/`)
- SSL volume removed (can be added later when SSL is configured)
- Build contexts use `../backend` and `../frontend`

**Step 3: Commit**

```bash
git add docker/docker-compose.prod.yml
git commit -m "chore: rewrite prod compose for Go/PostgreSQL stack with secrets"
```

---

### Task 4: Clean up backend .dockerignore

**Files:**
- Modify: `backend/.dockerignore`

**Step 1: Replace backend/.dockerignore with Go-appropriate entries**

```dockerignore
# Build artifacts
bin/
tmp/
vendor/

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Logs
*.log

# Local development
.env
.env.local
.env.*.local

# Git
.git/
.gitignore

# Documentation
README.md
docs/

# Air config
.air.toml
```

**Step 2: Commit**

```bash
git add backend/.dockerignore
git commit -m "chore: clean up backend .dockerignore for Go project"
```

---

### Task 5: Delete root .dockerignore

**Files:**
- Delete: `.dockerignore`

**Step 1: Remove the file**

```bash
git rm .dockerignore
```

**Step 2: Commit**

```bash
git commit -m "chore: remove root .dockerignore (builds run from service dirs)"
```

---

### Task 6: Update Makefile docker targets

**Files:**
- Modify: `Makefile:87-115` (Docker section)

**Step 1: Update the Docker section**

Replace lines 87-115 of the Makefile with:

```makefile
# ─── Docker ──────────────────────────────────────────────────────────

docker-build: ## Build all Docker images
	docker compose -f docker/docker-compose.yml build

docker-up: ## Start all services with Docker Compose
	docker compose -f docker/docker-compose.yml up -d

docker-down: ## Stop all Docker services
	docker compose -f docker/docker-compose.yml down

docker-logs: ## View logs from all services
	docker compose -f docker/docker-compose.yml logs -f

docker-backend-logs: ## View backend logs only
	docker compose -f docker/docker-compose.yml logs -f backend

docker-frontend-logs: ## View frontend logs only
	docker compose -f docker/docker-compose.yml logs -f frontend

docker-clean: ## Remove all containers, volumes, and images
	docker compose -f docker/docker-compose.yml down -v --rmi all

docker-prod-build: ## Build production images
	docker compose -f docker/docker-compose.prod.yml build

docker-prod-up: ## Start production services
	docker compose -f docker/docker-compose.prod.yml up -d
```

**Step 2: Commit**

```bash
git add Makefile
git commit -m "chore: update Makefile docker targets to use docker/ paths"
```

---

### Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update the Docker commands section**

In the Commands section, update the Docker block to:

```bash
# Docker (starts postgres, redis, backend, frontend)
make docker-up            # docker compose -f docker/docker-compose.yml up -d
make docker-down          # stop all services
make docker-logs          # tail all service logs
```

**Step 2: Update the Architecture section**

No changes needed — the architecture section doesn't reference Docker paths directly.

**Step 3: Update the Environment section**

Add a note about Docker file locations. After the line about `docker compose` wiring env vars, add:

> Docker compose files live under `docker/`. Dev: `docker/docker-compose.yml`. Prod: `docker/docker-compose.prod.yml`.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with new docker/ paths"
```

---

### Task 8: Verify docker compose config parses

**Step 1: Validate dev compose**

```bash
docker compose -f docker/docker-compose.yml config --quiet
```

Expected: exits 0, no output (valid config)

**Step 2: Validate prod compose**

```bash
CORS_ORIGINS=http://localhost BACKEND_URL=http://localhost:8001 FIREBASE_API_KEY=x FIREBASE_AUTH_DOMAIN=x FIREBASE_PROJECT_ID=x FIREBASE_STORAGE_BUCKET=x FIREBASE_MESSAGING_SENDER_ID=x FIREBASE_APP_ID=x docker compose -f docker/docker-compose.prod.yml config --quiet
```

Expected: exits 0 (env vars provided to satisfy `${VAR}` interpolation)

**Step 3: Commit (no code changes — verification only)**

No commit needed.
