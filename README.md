# GitFable

Gamified web app that matches developers with open-source "good first issues" through a card-draw mechanic. Draw issues, bookmark them, submit PRs, and earn XP, badges, and leaderboard rankings.

## 🚀 Production Features

### Authentication & Security
- ✅ **Firebase Authentication** - Supports GitHub OAuth, Email/Password, Google, and more
- ✅ Rate limiting (Redis-backed with local fallback)
- ✅ Request validation and sanitization
- ✅ Security headers (CSP, HSTS, X-Frame-Options)
- ✅ CORS protection
- ✅ Request size limits (1MB max)
- ✅ Input validation on all endpoints

### Core Functionality
- ✅ **PostgreSQL Database** - ACID compliant, relational data with SQLAlchemy ORM
- ✅ Real GitHub PR verification via API
- ✅ Webhook support for automatic PR merge detection
- ✅ Comprehensive database indexes
- ✅ Database migration system
- ✅ Health check and readiness endpoints

## Tech Stack

| Layer    | Technology                                          |
|----------|-----------------------------------------------------|
| Frontend | React 19, Tailwind CSS, Shadcn UI, Framer Motion   |
| Backend  | FastAPI, SQLAlchemy (async PostgreSQL), UV, Redis  |
| Database | PostgreSQL 16 with SQLAlchemy ORM                   |
| Auth     | Firebase Authentication (GitHub OAuth, Email/Pass)  |
| Package  | UV (Python), Yarn (Node.js)                         |

## Project Structure

```
gitfable-app/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI app entry point
│   │   ├── config.py             # Environment config
│   │   ├── database.py           # PostgreSQL connection
│   │   ├── firebase_admin.py     # Firebase Admin SDK init
│   │   ├── database_indexes.py   # Production indexes
│   │   ├── migrations.py         # Migration framework
│   │   ├── seed.py               # Mock data generators
│   │   ├── models/               # Pydantic request/response models
│   │   ├── routes/               # API route handlers
│   │   │   ├── auth.py           # Firebase auth integration
│   │   │   ├── draws.py          # Draw, choose, bookmark, PR verify
│   │   │   ├── users.py          # Dashboard, profile
│   │   │   ├── public.py         # Issues, leaderboard
│   │   │   └── webhooks.py       # GitHub webhooks
│   │   ├── services/             # Business logic
│   │   │   ├── auth.py           # Firebase token verification
│   │   │   ├── github_pr.py      # PR verification
│   │   │   ├── badges.py         # Badge conditions
│   │   │   ├── draws.py          # Draw helpers
│   │   │   ├── streaks.py        # Streak tracking
│   │   │   └── xp.py             # XP/level system
│   │   └── middleware/           # Security middleware
│   │       ├── rate_limit.py     # Rate limiting
│   │       └── security_headers.py # Security headers
│   ├── migrations/               # Database migrations
│   ├── tests/                    # Backend tests
│   ├── pyproject.toml            # UV project config
│   └── .env.example              # Environment template
├── frontend/
│   ├── src/
│   │   ├── pages/                # Route pages
│   │   ├── components/           # UI components
│   │   └── contexts/             # Auth context (Firebase)
│   └── package.json
├── docs/                         # Documentation
├── Makefile                      # Dev commands
└── README.md                     # This file
```

## Quick Start

### Prerequisites

- **UV** - Python package manager
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- **Node.js + Yarn** - Frontend tooling
- **MongoDB** - Database (local or MongoDB Atlas)
- **Redis** - Rate limiting (optional, falls back to local storage)
- **Firebase Project** - For authentication

### 1. Setup Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Authentication** → **GitHub** sign-in method
4. Create a GitHub OAuth App and link it (see docs)
5. Download **Service Account** credentials
6. See `docs/firebase-auth-setup.md` for detailed instructions

## Quick Start (Docker - Recommended)

The easiest way to run the entire application:

```bash
# 1. Setup environment
make env
# Edit backend/.env with your Firebase credentials

# 2. Start everything with Docker
make docker-up

# 3. Access the app
# Frontend: http://localhost:3000
# Backend API: http://localhost:8001
```

That's it! Docker will automatically start:
- MongoDB (database)
- Redis (rate limiting)
- Backend API (FastAPI)
- Frontend (React)

See `docs/docker-quickstart.md` for detailed Docker instructions.

---

## Quick Start (Manual Setup)

If you prefer to run without Docker:

### Prerequisites

- **UV** - Python package manager
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```
- **Node.js + Yarn** - Frontend tooling
- **MongoDB** - Database (local or MongoDB Atlas)
- **Redis** - Rate limiting (optional, falls back to local storage)
- **Firebase Project** - For authentication

### 1. Setup Firebase

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project
3. Enable **Authentication** → **GitHub** sign-in method
4. Create a GitHub OAuth App and link it (see docs)
5. Download **Service Account** credentials
6. See `docs/firebase-auth-setup.md` for detailed instructions

### 2. Setup Backend

### 3. Setup Frontend

```bash
# Install dependencies
cd frontend && yarn install

# Create Firebase config
# See docs/firebase-auth-setup.md for frontend setup

# Start frontend
yarn start  # http://localhost:3000
```

## Authentication Flow

GitFable uses **Firebase Authentication**:

1. **Frontend** authenticates user via Firebase (GitHub OAuth, Email, etc.)
2. **Frontend** receives Firebase ID token
3. **Frontend** sends token in `Authorization: Bearer <token>` header
4. **Backend** verifies token with Firebase Admin SDK
5. **Backend** looks up user in MongoDB by `firebase_uid`
6. **User** is authenticated and can make API calls

### API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user (after Firebase auth)
- `GET /api/auth/me` - Get current user profile
- `PUT /api/auth/me` - Update user profile
- `POST /api/auth/sync` - Sync user data with Firebase

#### Draws
- `POST /api/draws/draw` - Draw random issue
- `POST /api/draws/choose` - Choose specific issue
- `POST /api/draws/{id}/bookmark` - Bookmark draw
- `POST /api/draws/{id}/release` - Release bookmark
- `POST /api/draws/{id}/submit-pr` - Submit PR URL
- `POST /api/draws/{id}/verify` - Verify PR merge (via GitHub API)
- `GET /api/draws/history` - Get draw history

#### Users
- `GET /api/dashboard` - Get user dashboard
- `GET /api/profile/{username}` - Get public profile
- `PUT /api/users/filters` - Update user filters

#### Public
- `GET /api/issues` - Get issues list
- `GET /api/leaderboard` - Get leaderboard
- `GET /api/stats` - Get platform stats
- `GET /api/activity` - Get recent activity

#### Webhooks
- `POST /api/webhooks/github` - GitHub webhook endpoint

#### Health
- `GET /health` - Basic health check
- `GET /ready` - Readiness check (includes DB)

## Available Commands

Run `make help` to see all targets:

| Command              | Description                               |
|----------------------|-------------------------------------------|
| `make install`       | Install all dependencies (UV + Yarn)      |
| `make dev-backend`   | Start backend dev server with UV          |
| `make dev-frontend`  | Start frontend dev server                 |
| `make build`         | Build frontend for production             |
| `make test`          | Run all tests                             |
| `make lint`          | Lint frontend code                        |
| `make clean`         | Remove build artifacts and caches         |
| `make env`           | Create .env files from examples           |
| `make add PKG=foo`   | Add Python package with UV                |
| `make lock`          | Update uv.lock file                       |

### Docker Commands

| Command              | Description                               |
|----------------------|-------------------------------------------|
| `make docker-up`     | Start all services with Docker            |
| `make docker-down`   | Stop all Docker services                  |
| `make docker-logs`   | View logs from all services               |
| `make docker-build`  | Build all Docker images                   |
| `make docker-clean`  | Remove all containers and volumes         |

## Firebase Setup Guide

See `docs/firebase-auth-setup.md` for:
- Creating Firebase project
- Enabling GitHub OAuth
- Frontend Firebase configuration
- Authentication flow examples
- Troubleshooting

## Environment Variables

### Required
- `DATABASE_URL` - PostgreSQL connection string (e.g., `postgresql+asyncpg://user:pass@localhost:5432/gitfable`)
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_PRIVATE_KEY` - Service account private key
- `FIREBASE_CLIENT_EMAIL` - Service account email

### Security
- `CORS_ORIGINS` - Allowed origins (comma-separated)
- `REDIS_URL` - Redis connection (optional)
- `RATE_LIMIT_ENABLED` - Enable rate limiting (default: true)

### GitHub API (Optional)
- `GITHUB_CLIENT_ID` - GitHub OAuth app ID (for PR verification)
- `GITHUB_CLIENT_SECRET` - GitHub OAuth secret

### Other
- `ENVIRONMENT` - development/production
- `FRONTEND_URL` - Frontend URL for redirects
- `DEFAULT_DAILY_DRAW_LIMIT` - Fallback daily draw cap for users without overrides
- `SEED_DAILY_DRAW_LIMITS` - Dev-only `username:limit` overrides applied on startup

See `docs/draw-limit-overrides.md` for per-user override examples.

## Production Deployment

### Environment Checklist

Before deploying to production:

- [ ] Set up Firebase project with production config
- [ ] Download Firebase service account credentials
- [ ] Configure MongoDB with auth
- [ ] Set strong CORS origins
- [ ] Set up Redis for rate limiting
- [ ] Enable HTTPS
- [ ] Set ENVIRONMENT=production
- [ ] Configure GitHub webhooks (optional)

### Docker

```bash
# Build images
docker-compose -f docker-compose.yml build

# Run production stack
docker-compose -f docker-compose.prod.yml up -d
```

## Security

### Rate Limits
- Auth endpoints: 10 requests/minute
- Draw endpoints: 5 requests/minute
- Other endpoints: 100 requests/minute

### Authentication
- Firebase handles all OAuth flows
- Backend only verifies Firebase ID tokens
- Tokens expire after 1 hour (auto-refreshed by frontend)
- User data stored in MongoDB linked to Firebase UID

## Documentation

- `docs/docker-quickstart.md` - **Docker setup and deployment guide**
- `docs/firebase-auth-setup.md` - Firebase Authentication setup
- `docs/production-plan.md` - Original production readiness plan
- `docs/github-oauth-setup.md` - GitHub OAuth setup (if not using Firebase)
- `docs/design_guidelines.json` - UI/UX design system

## License

MIT
