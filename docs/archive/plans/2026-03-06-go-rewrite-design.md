# Go Backend Rewrite Design

## Context

Rewrite the GitFable Python/FastAPI backend in Go for better concurrency, deployment simplicity, and scalability to millions of users. The Python backend is ~15 files of CRUD with Firebase auth, PostgreSQL, and Redis.

## Decisions

- **Framework:** Chi (lightweight, idiomatic, great middleware support)
- **Database layer:** sqlc (type-safe generated code from SQL) + pgx (PostgreSQL driver)
- **Migrations:** golang-migrate
- **Auth:** Firebase Admin SDK for Go
- **Schema:** Full revamp (see below)
- **API:** Revised for robustness (versioned, cursor-paginated, standard envelope)
- **Deployment:** Clean replace of `backend/` directory, Python preserved in git history

## Project Structure

```
backend/
├── cmd/server/main.go           # entry point
├── internal/
│   ├── config/config.go         # env loading, validation
│   ├── database/
│   │   ├── queries.sql.go       # sqlc generated
│   │   ├── models.go            # sqlc generated structs
│   │   └── db.sqlc.go           # sqlc generated interface
│   ├── handler/
│   │   ├── auth.go              # register, me, update profile
│   │   ├── draws.go             # draw, choose, status transitions, PR, verify, history
│   │   ├── users.go             # dashboard, profile, filters
│   │   ├── public.go            # issues, leaderboard, stats, activity
│   │   ├── webhooks.go          # GitHub webhook
│   │   └── health.go            # liveness + readiness
│   ├── middleware/
│   │   ├── auth.go              # Firebase token verify, user context injection
│   │   ├── ratelimit.go         # Redis-backed, in-memory fallback
│   │   ├── security.go          # security headers
│   │   └── requestsize.go       # 1MB body limit
│   ├── service/
│   │   ├── xp.go                # award XP, calc level
│   │   ├── badges.go            # 10 badge definitions + check/award logic
│   │   ├── streaks.go           # streak calculation on merge
│   │   └── github.go            # PR URL parsing, GitHub API, webhook signature
│   ├── firebase/firebase.go     # Admin SDK init, token verification
│   └── redis/redis.go           # Redis client
├── sql/
│   ├── migrations/
│   │   ├── 001_initial.up.sql
│   │   └── 001_initial.down.sql
│   └── queries/
│       ├── users.sql
│       ├── issues.sql
│       ├── draws.sql
│       ├── activities.sql
│       └── badges.sql
├── seed.go
├── sqlc.yaml
├── go.mod
├── Dockerfile
└── .env.example
```

Go module: `github.com/nishantg96/gitfable`

## Dependencies

- `github.com/go-chi/chi/v5` — router
- `github.com/go-chi/cors` — CORS
- `github.com/jackc/pgx/v5` — PostgreSQL driver + connection pool
- `github.com/sqlc-dev/sqlc` — code generation (dev only)
- `firebase.google.com/go/v4` — Firebase Admin SDK
- `github.com/redis/go-redis/v9` — Redis
- `github.com/golang-migrate/migrate/v4` — migrations
- `github.com/google/uuid` — UUID generation
- `github.com/air-verse/air` — hot-reload in dev (dev only)
- `golangci-lint` — linting (dev only)

## Schema Revamp

### Key changes from Python version

| Change | Rationale |
|---|---|
| `BIGSERIAL` PKs + `UUID` public_id | 2-4x faster index lookups at millions of rows, UUIDs for API |
| Remove `github_access_token` from users | Security liability, not needed with Firebase |
| Remove `redraws_today` / `last_redraw_date` from users | Compute from draws table, eliminates write contention |
| Remove `active_bookmark_*` from users | Bookmark state belongs on the draw (expires_at column) |
| Remove `username` / `avatar_url` from activities | Join on user_id, avoids stale cached data |
| Split `repo` into `repo_owner` + `repo_name` on issues | Cleaner queries, proper indexing |
| DB-level enums for draw status, user status, issue state, activity action | Data integrity at storage layer |
| Add `events` table | Append-only audit log for all state changes |
| Add `expires_at` on draws | Bookmark expiry lives with the draw |
| Add `state` on issues (`open`, `closed`, `stale`) | Track issue availability |
| User `disabled` boolean → `status` enum (`active`, `suspended`, `deleted`) | Supports soft deletes |
| `created_at` / `updated_at` on all tables | Consistent timestamps |
| Remove `oauth_states` table | Unused since Firebase migration |
| Add `abandoned` draw status | Clean up unacted draws |
| `xp_awarded` NOT NULL DEFAULT 0 | Simplifies aggregation |
| Add `draw_id` FK on user_badges | Links badge to triggering draw |

### Tables

**users:** id (BIGSERIAL PK), public_id (UUID unique), firebase_uid, username, email, display_name, avatar_url, github_id, github_username, xp, level, current_streak, longest_streak, last_contribution_date, total_contributions, filters (JSONB), status (enum: active/suspended/deleted), created_at, updated_at

**issues:** id (BIGSERIAL PK), public_id (UUID unique), github_id, repo_owner, repo_name, title, url, language, difficulty, repo_stars, labels (TEXT[]), state (enum: open/closed/stale), created_at, updated_at

**draws:** id (BIGSERIAL PK), public_id (UUID unique), user_id (FK), issue_id (FK), status (enum: drawn/bookmarked/expired/pr_submitted/merged/abandoned), source (draw/choose), pr_url, pr_submitted_at, merge_commit_sha, merged_at, expires_at, xp_awarded (NOT NULL DEFAULT 0), created_at, updated_at

**activities:** id (BIGSERIAL PK), user_id (FK), draw_id (FK nullable), action (enum: merged/badge_earned/streak_milestone), repo_owner, repo_name, title, created_at

**badges:** id (BIGSERIAL PK), name (unique), description, icon

**user_badges:** id (BIGSERIAL PK), user_id (FK), badge_id (FK), draw_id (FK nullable), earned_at. Unique constraint on (user_id, badge_id).

**events:** id (BIGSERIAL PK), user_id (FK), event_type (VARCHAR 50), payload (JSONB), created_at. Index on (user_id, created_at).

## API Design

### Response envelope

Success:
```json
{"data": { ... }, "meta": {"next_cursor": "...", "has_more": true}, "error": null}
```

Error:
```json
{"data": null, "error": {"code": "DRAW_LIMIT_REACHED", "message": "..."}}
```

### Endpoints

All under `/api/v1/`.

**Auth:**
- `POST /auth/register`
- `GET /auth/me`
- `PUT /auth/me`

**Draws:**
- `POST /draws/` — draw random issue
- `POST /draws/choose` — choose specific issue
- `PUT /draws/{id}/status` — transition state (bookmark, release, abandon)
- `PUT /draws/{id}/pr` — submit PR URL
- `POST /draws/{id}/verify` — verify PR merge
- `GET /draws/history` — cursor-paginated history

**Users:**
- `GET /users/dashboard`
- `GET /users/{username}` — public profile
- `PUT /users/filters`

**Public:**
- `GET /issues` — cursor-paginated
- `GET /leaderboard` — cursor-paginated
- `GET /stats`
- `GET /activity` — cursor-paginated

**Webhooks:**
- `POST /webhooks/github`

**Health (no version prefix):**
- `GET /health`
- `GET /ready`

## Middleware Chain

Order: Request ID → Recovery → Request Size Limit → Security Headers → Rate Limiting → CORS → Structured Logging → (per-route Auth)

- **Request ID:** UUID per request, in context + response header
- **Recovery:** Catch panics, log with request ID, return 500
- **Rate limiting:** Redis with in-memory fallback. Auth: 10/min, draw mutations: 5/min, general: 100/min. Keyed on user ID or IP.
- **Logging:** `slog` (stdlib). JSON in production, text in dev. Includes request ID, method, path, duration, status.
- **Auth:** Per-route group. Firebase token → user lookup → context injection.

## Service Layer

Services are structs with interface-defined store dependencies for testability:

```go
type XPStore interface {
    GetUserXP(ctx context.Context, userID int64) (int, error)
    UpdateUserXP(ctx context.Context, arg UpdateUserXPParams) error
}
```

`*database.Queries` satisfies these interfaces implicitly.

**Transactions:** Critical multi-step operations (merge → award XP → update streak → check badges → record activity) use explicit `pgx.Tx` passed via `queries.WithTx(tx)`.

**CalcLevel:** Pure function: `(xp / 500) + 1`

**Badge conditions:** Slice of structs with `func(draws, user) bool` checkers. Adding a badge = append to slice.

## Testing Strategy

| Level | Scope | Mechanism | Speed |
|---|---|---|---|
| Unit | Service logic, pure functions | Interface mocks, no DB | Milliseconds |
| Integration | Handlers + real DB | testcontainers-go (Postgres container), run migrations | 2-5s per suite |
| E2E | Full HTTP flow | Docker compose, `net/http` client | Seconds |

Integration tests gated behind `-tags=integration` build tag.

Interfaces defined for: store layers (per service), FirebaseVerifier, GitHubClient.

## Configuration

Single `Config` struct loaded at startup. Production requires `CORSOrigins` to be set. Firebase credentials via file path or individual env vars.

## Deployment

- **Dockerfile:** Multi-stage build, ~15MB final image, <1s cold start
- **docker-compose.yml:** Same services (postgres, redis, backend, frontend), updated backend build
- **Dev hot-reload:** air
- **Migrations:** Auto-run in dev, explicit `migrate up` in production
- **Graceful shutdown:** 30s drain on SIGTERM/SIGINT

## Makefile Targets

```
dev-backend        air (hot-reload)
build-backend      go build -o bin/server ./cmd/server
test               go test ./...
test-integration   go test -tags=integration ./...
lint               golangci-lint run
generate           sqlc generate
migrate-up         migrate -path sql/migrations -database $DATABASE_URL up
migrate-down       migrate -path sql/migrations -database $DATABASE_URL down 1
```
