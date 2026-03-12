# GitFable

Gamified web app that matches developers with open-source "good first issues" through a card-draw mechanic. Draw issues, bookmark them, submit PRs, and earn XP, badges, and leaderboard rankings.

## 🚀 Production Features

### Authentication & Security
- ✅ **Supabase Authentication** - Supports GitHub OAuth and JWT-based sessions
- ✅ Rate limiting (Redis-backed with in-memory fallback)
- ✅ Request validation and sanitization
- ✅ Security headers (CSP, HSTS, X-Frame-Options)
- ✅ CORS protection
- ✅ Request size limits (1MB max)
- ✅ Input validation on all endpoints
- ✅ HMAC signature verification for webhooks

### Core Functionality
- ✅ **PostgreSQL Database** - ACID compliant, relational data with sqlc type-safe queries
- ✅ **Real GitHub PR verification** via GitHub API
- ✅ **Webhook support** for automatic PR merge detection
- ✅ Comprehensive database indexes
- ✅ Database migration system (golang-migrate)
- ✅ Health check and readiness endpoints
- ✅ Issue freshness checking (assignee, PR status)

### Gamification
- ✅ XP and level progression (500 XP per level)
- ✅ 10 narrative-themed badges
- ✅ Streak tracking (current and longest)
- ✅ Daily draw limits with per-user overrides
- ✅ Active bookmark queue (max 5 slots)
- ✅ Bookmark reactivation for expired items

## Tech Stack

| Layer    | Technology                                          |
|----------|-----------------------------------------------------|
| Frontend | React 19, Tailwind CSS, Shadcn UI, Framer Motion   |
| Backend  | Go (Chi router), sqlc, pgx (PostgreSQL driver)      |
| Database | PostgreSQL 16                                       |
| Cache    | Redis (optional, with in-memory fallback)           |
| Auth     | Supabase Auth (GitHub OAuth + JWT)                  |
| Build    | Go modules, Yarn (Node.js)                          |

## Project Structure

```
gitfable-app/
├── backend/
│   ├── cmd/
│   │   ├── server/           # Main application entry point
│   │   │   └── main.go
│   │   └── sync/             # CLI tool for GitHub issue sync
│   │       └── main.go
│   ├── internal/
│   │   ├── handler/          # HTTP handlers (auth, draws, users, public, webhooks)
│   │   ├── service/          # Business logic (XP, badges, streaks, GitHub client)
│   │   ├── middleware/       # Request ID, auth, rate limiting, security headers
│   │   ├── database/         # sqlc-generated queries and models
│   │   ├── config/           # Environment config loading
│   │   ├── supabase/         # Supabase Auth wrapper
│   │   ├── redis/            # Redis client with fallback
│   │   ├── ctxutil/          # Context helpers
│   │   └── seed/             # Mock data seeding for dev
│   ├── sql/
│   │   ├── migrations/       # golang-migrate SQL files
│   │   └── queries/          # sqlc query definitions
│   ├── go.mod                # Go module definition
│   └── go.sum                # Go module checksums
├── frontend/
│   ├── src/
│   │   ├── pages/            # Route pages (Landing, Discover, Dashboard, etc.)
│   │   ├── components/       # UI components
│   │   ├── contexts/         # Auth context (Supabase)
│   │   └── lib/              # Utilities (api, supabase, theme)
│   ├── public/
│   └── package.json
├── docker/                   # Docker configurations
│   ├── docker-compose.yml
│   └── .env.example
├── docs/                     # Documentation
├── Makefile                  # Dev commands
└── README.md                 # This file
```

## Quick Start (Docker - Recommended)

The easiest way to run the entire application:

```bash
# 1. Setup environment
make env
# Edit docker/.env with your Supabase credentials

# 2. Start everything with Docker
make docker-up

# 3. Access the app
# Frontend: http://localhost:3000
# Backend API: http://localhost:8001
```

Docker will automatically start:
- PostgreSQL 16 (database)
- Redis (rate limiting)
- Backend API (Go)
- Frontend (React)

See `docs/docker-quickstart.md` for detailed Docker instructions.

---

## Quick Start (Manual Setup)

### Prerequisites

- **Go 1.23+** - Backend runtime
  ```bash
  # macOS
  brew install go
  
  # Ubuntu/Debian
  sudo apt install golang-go
  ```
- **Node.js 20+ + Yarn** - Frontend tooling
- **PostgreSQL 16** - Database
- **Redis** - Rate limiting (optional, falls back to in-memory)
- **Supabase Project** - For authentication
- **sqlc** - SQL code generation
  ```bash
  go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
  ```
- **golang-migrate** - Database migrations
  ```bash
  go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest
  ```

### 1. Setup Supabase Auth

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Create a new project
3. Enable **Authentication** → **Providers** → **GitHub**
4. Create/Configure GitHub OAuth app callback URL from Supabase settings
5. Copy `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and anon key
6. See `docs/supabase-auth-setup.md` for detailed instructions

### 2. Setup Backend

```bash
# 1. Install Go dependencies
cd backend
go mod download

# 2. Setup environment
cp docker/.env.example docker/.env
# Edit docker/.env and set:
# - DATABASE_URL
# - SUPABASE_URL
# - SUPABASE_SERVICE_ROLE_KEY
# - GITHUB_TOKEN (for issue sync)

# 3. Run migrations
make migrate-up

# 4. Generate sqlc code (after changing SQL queries)
make generate

# 5. Start backend
make dev-backend  # Runs on :8001 with hot-reload via air
```

### 3. Setup Frontend

```bash
# 1. Install dependencies
cd frontend && yarn install

# 2. Create environment file
cp docker/.env.example docker/.env
# Edit docker/.env and set REACT_APP_BACKEND_URL

# 3. Start frontend
make dev-frontend  # Runs on :3000
```

---

## Authentication Flow

GitFable uses **Supabase Authentication**:

1. **Frontend** authenticates user via Supabase (GitHub OAuth)
2. **Frontend** receives Supabase access token (JWT)
3. **Frontend** sends token in `Authorization: Bearer <token>` header
4. **Backend** verifies token with Supabase GoTrue API
5. **Backend** looks up user in PostgreSQL by `auth_id`
6. **User** is authenticated and can make API calls

### API Endpoints

All API endpoints are prefixed with `/api/v1`.

#### Health (No Auth)
- `GET /health` - Basic health check
- `GET /ready` - Readiness check (includes DB connectivity)

#### Authentication (`/api/v1/auth`)
- `POST /auth/register` - Register new user (after Supabase auth)
- `GET /auth/me` - Get current user profile
- `PUT /auth/me` - Update user profile (display_name, avatar_url)

#### Draws (`/api/v1/draws`)
- `POST /draws/` - Draw random issue (weighted rarity)
- `POST /draws/choose` - Choose specific issue
- `PUT /draws/{id}/status` - Update draw status (bookmark, expire, abandon)
- `PUT /draws/{id}/pr` - Submit PR URL for verification
- `POST /draws/{id}/verify` - Manually verify PR merge status
- `POST /draws/{id}/reactivate` - Reactivate expired bookmark
- `GET /draws/history` - List draw history with cursor pagination

#### Users (`/api/v1/users`)
- `GET /users/dashboard` - Get authenticated user dashboard data
- `PUT /users/filters` - Update user filters (JSONB)
- `GET /users/{username}` - Get public profile by username

#### Public (No Auth)
- `GET /issues` - List issues with cursor pagination and filters
- `GET /leaderboard` - Get leaderboard with cursor pagination
- `GET /stats` - Get platform stats
- `GET /activity` - Get recent activity feed

#### Webhooks
- `POST /api/v1/webhooks/github` - GitHub PR merge webhook (HMAC verified)

## Available Commands

Run `make help` to see all targets:

| Command                 | Description                               |
|-------------------------|-------------------------------------------|
| `make install`          | Install all dependencies                  |
| `make dev-backend`      | Start backend dev server (:8001)          |
| `make dev-frontend`     | Start frontend dev server (:3000)         |
| `make build-backend`    | Build backend binary                      |
| `make test`             | Run backend tests                         |
| `make lint`             | Lint Go and frontend code                 |
| `make generate`         | Generate sqlc code from SQL queries       |
| `make migrate-up`       | Apply database migrations                 |
| `make migrate-down`     | Rollback last migration                   |
| `make sync-issues`      | Sync GitHub issues into database          |

### Docker Commands

| Command                 | Description                               |
|-------------------------|-------------------------------------------|
| `make docker-up`        | Start all services with Docker            |
| `make docker-down`      | Stop all Docker services                  |
| `make docker-logs`      | View logs from all services               |
| `make docker-build`     | Build all Docker images                   |
| `make test-docker`      | Run tests in isolated Docker environment  |
| `make test-full-workflow`| Run full E2E workflow tests              |

## Development Workflow

### Making Database Changes

1. **Add/modify SQL queries** in `backend/sql/queries/*.sql`
2. **Run `make generate`** to regenerate Go code with sqlc
3. **Create migration** for schema changes:
   ```bash
   migrate create -ext sql -dir backend/sql/migrations -seq your_migration_name
   ```
4. **Apply migrations**: `make migrate-up`

### Running Tests

```bash
# Backend unit tests
make test

# Specific package
cd backend && go test ./internal/handler/ -v

# E2E tests (requires Docker)
make test-full-workflow

# All tests in Docker
make test-docker
```

## Environment Variables

### Required
- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgres://user:pass@localhost:5432/gitfable`)
- `SUPABASE_URL` - Supabase project URL (e.g. `https://<project-ref>.supabase.co`)
- `SUPABASE_SERVICE_ROLE_KEY` - Supabase service role key (backend only)
- `REACT_APP_SUPABASE_URL` - Supabase project URL for frontend
- `REACT_APP_SUPABASE_ANON_KEY` - Supabase anon key for frontend
- `GITHUB_TOKEN` - GitHub Personal Access Token for issue sync

### Security
- `CORS_ORIGINS` - Allowed origins (comma-separated, default: `http://localhost:3000`)
- `REDIS_URL` - Redis connection (optional, e.g., `redis://localhost:6379`)
- `RATE_LIMIT_ENABLED` - Enable rate limiting (default: `true`)

### GitHub API
- `GITHUB_TOKEN` - For syncing issues and verifying PRs
- `GITHUB_WEBHOOK_SECRET` - For verifying GitHub webhook signatures

### Other
- `ENVIRONMENT` - `development` or `production`
- `PORT` - Backend port (default: `8001`)
- `DEFAULT_DAILY_DRAW_LIMIT` - Fallback daily draw cap (default: `3`)
- `DB_POOL_SIZE` - PostgreSQL connection pool size (default: `10`)

## Daily Draw Limits

### Global Default

Set the fallback daily draw cap for all users:

```bash
DEFAULT_DAILY_DRAW_LIMIT=3
```

### Per-User Overrides (Development)

In non-production environments, seed per-user draw limits on startup:

```bash
SEED_DAILY_DRAW_LIMITS=nishantg96:5,tester:7
```

Format: comma-separated `username:limit` pairs (case-insensitive).

### Manual Override

```sql
-- Set custom limit
UPDATE users
SET daily_draw_limit = 5
WHERE LOWER(username) = LOWER('nishantg96');

-- Remove override (falls back to global default)
UPDATE users
SET daily_draw_limit = NULL
WHERE LOWER(username) = LOWER('nishantg96');
```

## Production Deployment

### Environment Checklist

Before deploying to production:

- [ ] Set up Supabase project and GitHub OAuth provider
- [ ] Configure Supabase service role + anon keys
- [ ] Configure PostgreSQL with proper auth and SSL
- [ ] Set strong CORS origins
- [ ] Set up Redis for rate limiting
- [ ] Enable HTTPS
- [ ] Set ENVIRONMENT=production
- [ ] Configure GitHub webhooks (optional, for auto-merge detection)
- [ ] Run migrations: `make migrate-up`

### Docker Production

```bash
# Build production images
docker compose -f docker/docker-compose.prod.yml build

# Run production stack
docker compose -f docker/docker-compose.prod.yml up -d
```

## Security

### Rate Limits
- Draw endpoints: 5 requests/minute
- Auth endpoints: 10 requests/minute
- Other endpoints: 100 requests/minute

### Authentication
- Supabase handles OAuth and token lifecycle
- Backend verifies Supabase access tokens
- Tokens are auto-refreshed by Supabase client SDK
- User data stored in PostgreSQL linked to Supabase `auth_id`

### Database
- sqlc generates type-safe queries (prevents SQL injection)
- All inputs validated before database operations
- Transactions used for multi-step operations

## Documentation

- `docs/docker-quickstart.md` - Docker setup and deployment guide
- `docs/supabase-auth-setup.md` - Supabase authentication setup guide
- `docs/TESTING.md` - Comprehensive testing guide (unit, integration, E2E)
- `docs/archive/P2-BACKLOG.md` - Future feature roadmap
- `docs/design_guidelines.json` - UI/UX design system
- `docs/ops/DEPLOYMENT_RUNBOOK.md` - Dev/Prod deployment runbook (Supabase + Railway + Cloudflare)
- `docs/ops/SECRETS_SETUP.md` - Click-by-click setup for GitHub, Railway, Cloudflare, and Supabase secrets
- `docs/archive/` - Historical documents and implementation plans

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests (`make test`)
5. Run linter (`make lint`)
6. Commit your changes
7. Push to the branch
8. Open a Pull Request

## License

MIT
