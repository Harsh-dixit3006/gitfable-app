# GitFable

Gamified web app that matches developers with open-source "good first issues" through a card-draw mechanic. Draw issues, bookmark them, submit PRs, and earn XP, badges, and leaderboard rankings.

## 🚀 Production Features

### Authentication & Security
- ✅ **Firebase Authentication** - Supports GitHub OAuth, Email/Password, Google, and more
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
| Auth     | Firebase Authentication (GitHub OAuth, Email/Pass)  |
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
│   │   ├── firebase/         # Firebase Admin SDK wrapper
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
│   │   ├── contexts/         # Auth context (Firebase)
│   │   └── lib/              # Utilities (api, firebase, theme)
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
# Edit docker/.env with your Firebase credentials

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
- **Firebase Project** - For authentication
- **sqlc** - SQL code generation
  ```bash
  go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
  ```
- **golang-migrate** - Database migrations
  ```bash
  go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest
  ```

### 1. Setup Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Authentication** → **GitHub** sign-in method
4. Create a GitHub OAuth App and link it (see `docs/firebase-auth-setup.md`)
5. Download **Service Account** credentials JSON file
6. See `docs/firebase-auth-setup.md` for detailed instructions

### 2. Setup Backend

```bash
# 1. Install Go dependencies
cd backend
go mod download

# 2. Setup environment
cp docker/.env.example docker/.env
# Edit docker/.env and set:
# - DATABASE_URL
# - FIREBASE_SERVICE_ACCOUNT_PATH (absolute path to your Firebase JSON)
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

GitFable uses **Firebase Authentication**:

1. **Frontend** authenticates user via Firebase (GitHub OAuth, Email, etc.)
2. **Frontend** receives Firebase ID token
3. **Frontend** sends token in `Authorization: Bearer <token>` header
4. **Backend** verifies token with Firebase Admin SDK
5. **Backend** looks up user in PostgreSQL by `firebase_uid`
6. **User** is authenticated and can make API calls

### API Endpoints

All API endpoints are prefixed with `/api/v1`.

#### Health (No Auth)
- `GET /health` - Basic health check
- `GET /ready` - Readiness check (includes DB connectivity)

#### Authentication (`/api/v1/auth`)
- `POST /auth/register` - Register new user (after Firebase auth)
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
- `FIREBASE_SERVICE_ACCOUNT_PATH` - Absolute path to Firebase service account JSON file
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

See `docs/draw-limit-overrides.md` for per-user override examples.

## Production Deployment

### Environment Checklist

Before deploying to production:

- [ ] Set up Firebase project with production config
- [ ] Download Firebase service account credentials
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
- Firebase handles all OAuth flows securely
- Backend only verifies Firebase ID tokens
- Tokens expire after 1 hour (auto-refreshed by frontend Firebase SDK)
- User data stored in PostgreSQL linked to Firebase UID

### Database
- sqlc generates type-safe queries (prevents SQL injection)
- All inputs validated before database operations
- Transactions used for multi-step operations

## Documentation

- `docs/docker-quickstart.md` - Docker setup and deployment guide
- `docs/firebase-auth-setup.md` - Firebase Authentication setup
- `docs/FULL_WORKFLOW_TEST.md` - E2E testing documentation
- `docs/TESTING_DOCKER.md` - Docker testing environment
- `docs/production-plan.md` - Original production readiness plan
- `docs/design_guidelines.json` - UI/UX design system

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
