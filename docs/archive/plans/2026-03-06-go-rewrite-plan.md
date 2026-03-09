# Go Backend Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite the GitFable backend from Python/FastAPI to Go/Chi with a revamped schema, versioned API, and scalable architecture.

**Architecture:** Chi router with handler structs per domain, sqlc-generated type-safe queries over pgx, service layer with interface-defined store dependencies for testability, Firebase Admin SDK for auth, Redis for rate limiting with in-memory fallback.

**Tech Stack:** Go 1.23, Chi v5, pgx v5, sqlc, golang-migrate, Firebase Admin SDK for Go, go-redis v9, slog for logging.

---

## Task 1: Scaffold Go module and directory structure

**Files:**
- Create: `backend/go.mod`
- Create: `backend/cmd/server/main.go`
- Create: `backend/internal/config/config.go`
- Create: `backend/.env.example`
- Create: `backend/.air.toml`

**Step 1: Initialize Go module and install dependencies**

```bash
cd backend
# Remove Python files (preserved in git history)
rm -rf app/ tests/ .venv/ pyproject.toml requirements.txt requirements.in uv.lock seed.py __pycache__

go mod init github.com/nishantg96/gitfable
go get github.com/go-chi/chi/v5@latest
go get github.com/go-chi/cors@latest
go get github.com/jackc/pgx/v5@latest
go get firebase.google.com/go/v4@latest
go get github.com/redis/go-redis/v9@latest
go get github.com/golang-migrate/migrate/v4@latest
go get github.com/google/uuid@latest
go get google.golang.org/api@latest
```

**Step 2: Create directory structure**

```bash
mkdir -p cmd/server
mkdir -p internal/{config,database,handler,middleware,service,firebase,redis}
mkdir -p sql/{migrations,queries}
```

**Step 3: Write config loader**

Create `internal/config/config.go`:

```go
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Environment string
	Port        int

	DatabaseURL string
	DBPoolSize  int

	FirebaseCredentialsPath string
	FirebaseProjectID       string
	FirebasePrivateKey      string
	FirebaseClientEmail     string

	RedisURL         string
	RateLimitEnabled bool

	GitHubWebhookSecret string

	CORSOrigins []string
	FrontendURL string
}

func Load() (*Config, error) {
	cfg := &Config{
		Environment: getEnv("ENVIRONMENT", "development"),
		Port:        getEnvInt("PORT", 8001),

		DatabaseURL: getEnv("DATABASE_URL", "postgresql://gitfable:gitfable@localhost:5432/gitfable?sslmode=disable"),
		DBPoolSize:  getEnvInt("DB_POOL_SIZE", 25),

		FirebaseCredentialsPath: getEnv("FIREBASE_SERVICE_ACCOUNT_PATH", ""),
		FirebaseProjectID:       getEnv("FIREBASE_PROJECT_ID", ""),
		FirebasePrivateKey:      strings.ReplaceAll(getEnv("FIREBASE_PRIVATE_KEY", ""), "\\n", "\n"),
		FirebaseClientEmail:     getEnv("FIREBASE_CLIENT_EMAIL", ""),

		RedisURL:         getEnv("REDIS_URL", "redis://localhost:6379"),
		RateLimitEnabled: getEnvBool("RATE_LIMIT_ENABLED", true),

		GitHubWebhookSecret: getEnv("GITHUB_WEBHOOK_SECRET", ""),

		CORSOrigins: parseCSV(getEnv("CORS_ORIGINS", "")),
		FrontendURL: getEnv("FRONTEND_URL", "http://localhost:3000"),
	}

	if cfg.IsProduction() && len(cfg.CORSOrigins) == 0 {
		return nil, fmt.Errorf("CORS_ORIGINS must be set in production")
	}

	return cfg, nil
}

func (c *Config) IsProduction() bool {
	return c.Environment == "production"
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		return strings.ToLower(v) == "true"
	}
	return fallback
}

func parseCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			result = append(result, t)
		}
	}
	return result
}
```

**Step 4: Write minimal main.go**

Create `cmd/server/main.go`:

```go
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nishantg96/gitfable/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	// Configure logging
	var handler slog.Handler
	if cfg.IsProduction() {
		handler = slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	} else {
		handler = slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug})
	}
	slog.SetDefault(slog.New(handler))

	slog.Info("starting GitFable API", "port", cfg.Port, "env", cfg.Environment)

	// TODO: wire up database, firebase, redis, router
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":{"status":"healthy"},"error":null}`))
	})

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%d", cfg.Port),
		Handler: mux,
	}

	// Graceful shutdown
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	go func() {
		slog.Info("server listening", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	<-ctx.Done()
	slog.Info("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		slog.Error("shutdown error", "error", err)
	}
	slog.Info("server stopped")
}
```

**Step 5: Create .env.example**

Create `backend/.env.example`:

```
ENVIRONMENT=development
PORT=8001

DATABASE_URL=postgresql://gitfable:gitfable@localhost:5432/gitfable?sslmode=disable
DB_POOL_SIZE=25

FIREBASE_SERVICE_ACCOUNT_PATH=
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

REDIS_URL=redis://localhost:6379
RATE_LIMIT_ENABLED=true

GITHUB_WEBHOOK_SECRET=

CORS_ORIGINS=http://localhost:3000
FRONTEND_URL=http://localhost:3000
```

**Step 6: Verify it compiles and runs**

```bash
cd backend && go build ./cmd/server && echo "BUILD OK"
```

Expected: `BUILD OK`

**Step 7: Commit**

```bash
git add backend/
git commit -m "feat: scaffold Go backend with config and minimal server"
```

---

## Task 2: Database schema migration

**Files:**
- Create: `backend/sql/migrations/001_initial.up.sql`
- Create: `backend/sql/migrations/001_initial.down.sql`

**Step 1: Write up migration**

Create `sql/migrations/001_initial.up.sql`:

```sql
-- Enums
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE draw_status AS ENUM ('drawn', 'bookmarked', 'expired', 'pr_submitted', 'merged', 'abandoned');
CREATE TYPE issue_state AS ENUM ('open', 'closed', 'stale');
CREATE TYPE activity_action AS ENUM ('merged', 'badge_earned', 'streak_milestone');

-- Users
CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    firebase_uid VARCHAR(128) NOT NULL UNIQUE,
    username VARCHAR(39) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    github_id VARCHAR(64) UNIQUE,
    github_username VARCHAR(39) UNIQUE,
    xp INTEGER NOT NULL DEFAULT 0,
    level INTEGER NOT NULL DEFAULT 1,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_contribution_date TIMESTAMPTZ,
    total_contributions INTEGER NOT NULL DEFAULT 0,
    filters JSONB NOT NULL DEFAULT '{}',
    status user_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_username ON users(LOWER(username));
CREATE INDEX idx_users_xp ON users(xp DESC);

-- Issues
CREATE TABLE issues (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    github_id BIGINT NOT NULL UNIQUE,
    repo_owner VARCHAR(255) NOT NULL,
    repo_name VARCHAR(255) NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    language VARCHAR(50),
    difficulty VARCHAR(20),
    repo_stars INTEGER NOT NULL DEFAULT 0,
    labels TEXT[] NOT NULL DEFAULT '{}',
    state issue_state NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_issues_language ON issues(language);
CREATE INDEX idx_issues_difficulty ON issues(difficulty);
CREATE INDEX idx_issues_state ON issues(state);
CREATE INDEX idx_issues_repo ON issues(repo_owner, repo_name);
CREATE INDEX idx_issues_stars ON issues(repo_stars DESC);

-- Draws
CREATE TABLE draws (
    id BIGSERIAL PRIMARY KEY,
    public_id UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
    user_id BIGINT NOT NULL REFERENCES users(id),
    issue_id BIGINT NOT NULL REFERENCES issues(id),
    status draw_status NOT NULL DEFAULT 'drawn',
    source VARCHAR(20) NOT NULL DEFAULT 'draw',
    pr_url TEXT,
    pr_submitted_at TIMESTAMPTZ,
    merge_commit_sha VARCHAR(255),
    merged_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    xp_awarded INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_draws_user_id ON draws(user_id);
CREATE INDEX idx_draws_issue_id ON draws(issue_id);
CREATE INDEX idx_draws_status ON draws(status);
CREATE INDEX idx_draws_user_status ON draws(user_id, status);
CREATE INDEX idx_draws_user_created ON draws(user_id, created_at DESC);
CREATE INDEX idx_draws_merged_at ON draws(merged_at DESC) WHERE merged_at IS NOT NULL;
CREATE INDEX idx_draws_pr_url ON draws(pr_url) WHERE pr_url IS NOT NULL;

-- Badges
CREATE TABLE badges (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT NOT NULL DEFAULT '',
    icon VARCHAR(50) NOT NULL DEFAULT ''
);

-- User Badges
CREATE TABLE user_badges (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    badge_id BIGINT NOT NULL REFERENCES badges(id),
    draw_id BIGINT REFERENCES draws(id),
    earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, badge_id)
);

CREATE INDEX idx_user_badges_user ON user_badges(user_id);

-- Activities
CREATE TABLE activities (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    draw_id BIGINT REFERENCES draws(id),
    action activity_action NOT NULL,
    repo_owner VARCHAR(255),
    repo_name VARCHAR(255),
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_activities_user_time ON activities(user_id, created_at DESC);
CREATE INDEX idx_activities_created ON activities(created_at DESC);

-- Events (audit log)
CREATE TABLE events (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    event_type VARCHAR(50) NOT NULL,
    payload JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_user_time ON events(user_id, created_at DESC);
CREATE INDEX idx_events_type ON events(event_type);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_issues_updated_at BEFORE UPDATE ON issues FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_draws_updated_at BEFORE UPDATE ON draws FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

**Step 2: Write down migration**

Create `sql/migrations/001_initial.down.sql`:

```sql
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS activities;
DROP TABLE IF EXISTS user_badges;
DROP TABLE IF EXISTS badges;
DROP TABLE IF EXISTS draws;
DROP TABLE IF EXISTS issues;
DROP TABLE IF EXISTS users;
DROP FUNCTION IF EXISTS update_updated_at();
DROP TYPE IF EXISTS activity_action;
DROP TYPE IF EXISTS issue_state;
DROP TYPE IF EXISTS draw_status;
DROP TYPE IF EXISTS user_status;
```

**Step 3: Test migration against local Postgres**

```bash
# Requires running Postgres (docker compose up postgres -d)
migrate -path sql/migrations -database "postgresql://gitfable:gitfable@localhost:5432/gitfable?sslmode=disable" up
```

Expected: `1/u initial` (no errors)

**Step 4: Test down migration**

```bash
migrate -path sql/migrations -database "postgresql://gitfable:gitfable@localhost:5432/gitfable?sslmode=disable" down 1
```

Expected: `1/d initial` (no errors)

**Step 5: Re-apply up migration (leave schema in place for sqlc)**

```bash
migrate -path sql/migrations -database "postgresql://gitfable:gitfable@localhost:5432/gitfable?sslmode=disable" up
```

**Step 6: Commit**

```bash
git add sql/
git commit -m "feat: add PostgreSQL schema migration with enums, indexes, and audit log"
```

---

## Task 3: sqlc queries and code generation

**Files:**
- Create: `backend/sqlc.yaml`
- Create: `backend/sql/queries/users.sql`
- Create: `backend/sql/queries/issues.sql`
- Create: `backend/sql/queries/draws.sql`
- Create: `backend/sql/queries/badges.sql`
- Create: `backend/sql/queries/activities.sql`
- Create: `backend/sql/queries/events.sql`
- Generated: `backend/internal/database/*.go`

**Step 1: Write sqlc config**

Create `sqlc.yaml`:

```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "sql/queries"
    schema: "sql/migrations"
    gen:
      go:
        package: "database"
        out: "internal/database"
        sql_package: "pgx/v5"
        emit_json_tags: true
        emit_empty_slices: true
        overrides:
          - db_type: "uuid"
            go_type: "github.com/google/uuid.UUID"
          - db_type: "timestamptz"
            go_type: "time.Time"
            nullable: false
          - db_type: "timestamptz"
            go_type:
              import: "database/sql"
              type: "NullTime"
            nullable: true
          - db_type: "jsonb"
            go_type: "json.RawMessage"
            nullable: false
```

**Step 2: Write user queries**

Create `sql/queries/users.sql`:

```sql
-- name: GetUserByFirebaseUID :one
SELECT * FROM users WHERE firebase_uid = $1;

-- name: GetUserByUsername :one
SELECT * FROM users WHERE LOWER(username) = LOWER($1);

-- name: GetUserByID :one
SELECT * FROM users WHERE id = $1;

-- name: GetUserByPublicID :one
SELECT * FROM users WHERE public_id = $1;

-- name: CreateUser :one
INSERT INTO users (firebase_uid, username, email, display_name, avatar_url, github_id, github_username)
VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING *;

-- name: UpdateUserProfile :one
UPDATE users SET display_name = $2, avatar_url = $3 WHERE id = $1 RETURNING *;

-- name: UpdateUserFilters :one
UPDATE users SET filters = $2 WHERE id = $1 RETURNING *;

-- name: UpdateUserXP :one
UPDATE users SET xp = $2, level = $3 WHERE id = $1 RETURNING *;

-- name: UpdateUserStreak :exec
UPDATE users SET current_streak = $2, longest_streak = $3, last_contribution_date = $4 WHERE id = $1;

-- name: IncrementContributions :exec
UPDATE users SET total_contributions = total_contributions + 1 WHERE id = $1;

-- name: GetLeaderboard :many
SELECT id, public_id, username, display_name, avatar_url, xp, level, total_contributions
FROM users
WHERE status = 'active'
ORDER BY xp DESC
LIMIT $1;

-- name: GetLeaderboardAfterCursor :many
SELECT id, public_id, username, display_name, avatar_url, xp, level, total_contributions
FROM users
WHERE status = 'active' AND (xp, id) < ($1, $2)
ORDER BY xp DESC, id DESC
LIMIT $3;

-- name: CountActiveUsers :one
SELECT COUNT(*) FROM users WHERE status = 'active';

-- name: SyncUserFromFirebase :one
UPDATE users SET email = $2, display_name = $3, avatar_url = $4 WHERE firebase_uid = $1 RETURNING *;
```

**Step 3: Write issue queries**

Create `sql/queries/issues.sql`:

```sql
-- name: GetIssueByID :one
SELECT * FROM issues WHERE id = $1;

-- name: GetIssueByPublicID :one
SELECT * FROM issues WHERE public_id = $1;

-- name: GetRandomIssue :one
SELECT * FROM issues
WHERE state = 'open'
  AND ($1::text IS NULL OR language = $1)
  AND ($2::text IS NULL OR difficulty = $2)
ORDER BY RANDOM()
LIMIT 1;

-- name: ListIssues :many
SELECT * FROM issues
WHERE state = 'open'
  AND ($1::text IS NULL OR language = $1)
  AND ($2::text IS NULL OR difficulty = $2)
ORDER BY repo_stars DESC
LIMIT $3;

-- name: ListIssuesAfterCursor :many
SELECT * FROM issues
WHERE state = 'open'
  AND ($1::text IS NULL OR language = $1)
  AND ($2::text IS NULL OR difficulty = $2)
  AND (repo_stars, id) < ($3, $4)
ORDER BY repo_stars DESC, id DESC
LIMIT $5;

-- name: CountDistinctRepos :one
SELECT COUNT(DISTINCT (repo_owner, repo_name)) FROM issues WHERE state = 'open';

-- name: CreateIssue :one
INSERT INTO issues (github_id, repo_owner, repo_name, title, url, language, difficulty, repo_stars, labels, state)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: CountIssues :one
SELECT COUNT(*) FROM issues;
```

**Step 4: Write draw queries**

Create `sql/queries/draws.sql`:

```sql
-- name: CreateDraw :one
INSERT INTO draws (user_id, issue_id, status, source)
VALUES ($1, $2, 'drawn', $3)
RETURNING *;

-- name: GetDrawByID :one
SELECT * FROM draws WHERE id = $1;

-- name: GetDrawByPublicID :one
SELECT * FROM draws WHERE public_id = $1;

-- name: GetDrawByPublicIDAndUser :one
SELECT * FROM draws WHERE public_id = $1 AND user_id = $2;

-- name: GetDrawByPRURL :one
SELECT * FROM draws WHERE pr_url = $1 AND status = 'pr_submitted';

-- name: UpdateDrawStatus :one
UPDATE draws SET status = $2 WHERE id = $1 RETURNING *;

-- name: BookmarkDraw :one
UPDATE draws SET status = 'bookmarked', expires_at = $2 WHERE id = $1 AND status = 'drawn' RETURNING *;

-- name: SubmitPR :one
UPDATE draws SET status = 'pr_submitted', pr_url = $2, pr_submitted_at = NOW() WHERE id = $1 RETURNING *;

-- name: MergeDraw :one
UPDATE draws SET status = 'merged', merged_at = NOW(), merge_commit_sha = $2, xp_awarded = $3 WHERE id = $1 RETURNING *;

-- name: CountDrawsToday :one
SELECT COUNT(*) FROM draws
WHERE user_id = $1 AND created_at >= CURRENT_DATE AND source = 'draw';

-- name: GetActiveBookmark :one
SELECT * FROM draws
WHERE user_id = $1 AND status = 'bookmarked' AND (expires_at IS NULL OR expires_at > NOW())
LIMIT 1;

-- name: ListUserDraws :many
SELECT d.*, i.public_id AS issue_public_id, i.repo_owner, i.repo_name, i.title AS issue_title, i.url AS issue_url, i.language, i.difficulty, i.repo_stars, i.labels
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1
ORDER BY d.created_at DESC
LIMIT $2;

-- name: ListUserDrawsAfterCursor :many
SELECT d.*, i.public_id AS issue_public_id, i.repo_owner, i.repo_name, i.title AS issue_title, i.url AS issue_url, i.language, i.difficulty, i.repo_stars, i.labels
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1 AND (d.created_at, d.id) < ($2, $3)
ORDER BY d.created_at DESC, d.id DESC
LIMIT $4;

-- name: ListUserDrawsByStatus :many
SELECT d.*, i.public_id AS issue_public_id, i.repo_owner, i.repo_name, i.title AS issue_title, i.url AS issue_url, i.language, i.difficulty, i.repo_stars, i.labels
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1 AND d.status = $2
ORDER BY d.created_at DESC
LIMIT $3;

-- name: CountUserDraws :one
SELECT COUNT(*) FROM draws WHERE user_id = $1;

-- name: CountUserMergedDraws :one
SELECT COUNT(*) FROM draws WHERE user_id = $1 AND status = 'merged';

-- name: CountMergedDraws :one
SELECT COUNT(*) FROM draws WHERE status = 'merged';

-- name: GetUserMergedDrawsWithIssues :many
SELECT d.*, i.repo_owner, i.repo_name, i.language, i.labels, i.difficulty
FROM draws d
JOIN issues i ON d.issue_id = i.id
WHERE d.user_id = $1 AND d.status = 'merged'
ORDER BY d.merged_at DESC;

-- name: GetUserDrawStats :one
SELECT
    COUNT(*) AS total_draws,
    COUNT(*) FILTER (WHERE status IN ('bookmarked', 'pr_submitted', 'merged')) AS bookmarked_count,
    COUNT(*) FILTER (WHERE status = 'merged') AS merged_count
FROM draws
WHERE user_id = $1;

-- name: GetUserHeatmap :many
SELECT DATE(created_at) AS day, COUNT(*) AS count
FROM draws
WHERE user_id = $1 AND created_at >= $2
GROUP BY DATE(created_at)
ORDER BY day;
```

**Step 5: Write badge queries**

Create `sql/queries/badges.sql`:

```sql
-- name: GetBadgeByName :one
SELECT * FROM badges WHERE name = $1;

-- name: CreateBadge :one
INSERT INTO badges (name, description, icon) VALUES ($1, $2, $3)
ON CONFLICT (name) DO NOTHING
RETURNING *;

-- name: UpsertBadge :exec
INSERT INTO badges (name, description, icon) VALUES ($1, $2, $3)
ON CONFLICT (name) DO UPDATE SET description = $2, icon = $3;

-- name: AwardBadge :one
INSERT INTO user_badges (user_id, badge_id, draw_id, earned_at)
VALUES ($1, $2, $3, NOW())
ON CONFLICT (user_id, badge_id) DO NOTHING
RETURNING *;

-- name: GetUserBadges :many
SELECT ub.earned_at, b.name, b.description, b.icon
FROM user_badges ub
JOIN badges b ON ub.badge_id = b.id
WHERE ub.user_id = $1
ORDER BY ub.earned_at DESC;

-- name: GetUserBadgeNames :many
SELECT b.name FROM user_badges ub JOIN badges b ON ub.badge_id = b.id WHERE ub.user_id = $1;

-- name: ListBadges :many
SELECT * FROM badges ORDER BY id;
```

**Step 6: Write activity queries**

Create `sql/queries/activities.sql`:

```sql
-- name: CreateActivity :one
INSERT INTO activities (user_id, draw_id, action, repo_owner, repo_name, title)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListRecentActivities :many
SELECT a.*, u.username, u.avatar_url, u.public_id AS user_public_id
FROM activities a
JOIN users u ON a.user_id = u.id
ORDER BY a.created_at DESC
LIMIT $1;

-- name: ListRecentActivitiesAfterCursor :many
SELECT a.*, u.username, u.avatar_url, u.public_id AS user_public_id
FROM activities a
JOIN users u ON a.user_id = u.id
WHERE (a.created_at, a.id) < ($1, $2)
ORDER BY a.created_at DESC, a.id DESC
LIMIT $3;
```

**Step 7: Write event queries**

Create `sql/queries/events.sql`:

```sql
-- name: CreateEvent :exec
INSERT INTO events (user_id, event_type, payload) VALUES ($1, $2, $3);

-- name: GetUserEvents :many
SELECT * FROM events WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2;
```

**Step 8: Generate Go code**

```bash
cd backend && sqlc generate
```

Expected: Files created in `internal/database/` with no errors.

**Step 9: Verify it compiles**

```bash
cd backend && go build ./...
```

Expected: No errors.

**Step 10: Commit**

```bash
git add backend/sqlc.yaml backend/sql/ backend/internal/database/
git commit -m "feat: add sqlc queries and generate type-safe database layer"
```

---

## Task 4: Database connection pool and migration runner

**Files:**
- Create: `backend/internal/database/pool.go`

**Step 1: Write pool setup with embedded migration runner**

Create `internal/database/pool.go`:

```go
package database

import (
	"context"
	"embed"
	"fmt"
	"log/slog"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed ../../sql/migrations/*.sql
var migrationsFS embed.FS

func NewPool(ctx context.Context, databaseURL string, poolSize int) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = int32(poolSize)

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}

func RunMigrations(databaseURL string) error {
	// Convert asyncpg URL to standard postgres URL if needed
	d, err := iofs.New(migrationsFS, "sql/migrations")
	if err != nil {
		return fmt.Errorf("open migrations: %w", err)
	}

	m, err := migrate.NewWithSourceInstance("iofs", d, databaseURL)
	if err != nil {
		return fmt.Errorf("create migrator: %w", err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("run migrations: %w", err)
	}

	version, dirty, _ := m.Version()
	slog.Info("migrations applied", "version", version, "dirty", dirty)
	return nil
}
```

Note: The embed path `../../sql/migrations/*.sql` won't work from `internal/database/`. The migration files need to be embedded from the module root. This will need adjustment — either move the embed directive to `cmd/server/main.go` or restructure. We'll fix this during implementation by using a separate `migrations` package at the root or passing the FS from main.

**Step 2: Verify it compiles**

```bash
cd backend && go build ./...
```

**Step 3: Commit**

```bash
git add backend/internal/database/pool.go
git commit -m "feat: add pgxpool connection setup and embedded migration runner"
```

---

## Task 5: Response helpers and error codes

**Files:**
- Create: `backend/internal/handler/response.go`

**Step 1: Write response envelope helpers**

Create `internal/handler/response.go`:

```go
package handler

import (
	"encoding/json"
	"net/http"
)

type Response struct {
	Data  any        `json:"data"`
	Meta  *Meta      `json:"meta,omitempty"`
	Error *APIError  `json:"error"`
}

type Meta struct {
	NextCursor string `json:"next_cursor,omitempty"`
	HasMore    bool   `json:"has_more"`
}

type APIError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// Standard error codes
const (
	ErrCodeBadRequest       = "BAD_REQUEST"
	ErrCodeUnauthorized     = "UNAUTHORIZED"
	ErrCodeForbidden        = "FORBIDDEN"
	ErrCodeNotFound         = "NOT_FOUND"
	ErrCodeConflict         = "CONFLICT"
	ErrCodeRateLimited      = "RATE_LIMITED"
	ErrCodeTooLarge         = "REQUEST_TOO_LARGE"
	ErrCodeInternal         = "INTERNAL_ERROR"
	ErrCodeDrawLimitReached = "DRAW_LIMIT_REACHED"
	ErrCodeInvalidStatus    = "INVALID_STATUS_TRANSITION"
	ErrCodeBookmarkExists   = "BOOKMARK_EXISTS"
	ErrCodeInvalidPRURL     = "INVALID_PR_URL"
	ErrCodePRNotMerged      = "PR_NOT_MERGED"
	ErrCodeUserDisabled     = "USER_DISABLED"
	ErrCodeUsernameTaken    = "USERNAME_TAKEN"
	ErrCodeEmailTaken       = "EMAIL_TAKEN"
)

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func OK(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusOK, Response{Data: data})
}

func Created(w http.ResponseWriter, data any) {
	writeJSON(w, http.StatusCreated, Response{Data: data})
}

func OKList(w http.ResponseWriter, data any, nextCursor string, hasMore bool) {
	writeJSON(w, http.StatusOK, Response{
		Data: data,
		Meta: &Meta{NextCursor: nextCursor, HasMore: hasMore},
	})
}

func Error(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, Response{Error: &APIError{Code: code, Message: message}})
}

func BadRequest(w http.ResponseWriter, code, message string) {
	Error(w, http.StatusBadRequest, code, message)
}

func Unauthorized(w http.ResponseWriter) {
	Error(w, http.StatusUnauthorized, ErrCodeUnauthorized, "Authentication required")
}

func Forbidden(w http.ResponseWriter, message string) {
	Error(w, http.StatusForbidden, ErrCodeForbidden, message)
}

func NotFound(w http.ResponseWriter, message string) {
	Error(w, http.StatusNotFound, ErrCodeNotFound, message)
}

func InternalError(w http.ResponseWriter) {
	Error(w, http.StatusInternalServerError, ErrCodeInternal, "Internal server error")
}
```

**Step 2: Verify it compiles**

```bash
cd backend && go build ./...
```

**Step 3: Commit**

```bash
git add backend/internal/handler/response.go
git commit -m "feat: add JSON response envelope and error code helpers"
```

---

## Task 6: Firebase integration

**Files:**
- Create: `backend/internal/firebase/firebase.go`

**Step 1: Write Firebase client wrapper**

Create `internal/firebase/firebase.go`:

```go
package firebase

import (
	"context"
	"fmt"

	fb "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/auth"
	"google.golang.org/api/option"
)

type Client struct {
	authClient *auth.Client
}

func NewClient(ctx context.Context, credentialsPath string) (*Client, error) {
	var app *fb.App
	var err error

	if credentialsPath != "" {
		app, err = fb.NewApp(ctx, nil, option.WithCredentialsFile(credentialsPath))
	} else {
		// Falls back to GOOGLE_APPLICATION_CREDENTIALS or default credentials
		app, err = fb.NewApp(ctx, nil)
	}
	if err != nil {
		return nil, fmt.Errorf("init firebase app: %w", err)
	}

	authClient, err := app.Auth(ctx)
	if err != nil {
		return nil, fmt.Errorf("init firebase auth: %w", err)
	}

	return &Client{authClient: authClient}, nil
}

type TokenInfo struct {
	UID           string
	Email         string
	EmailVerified bool
	Claims        map[string]any
}

func (c *Client) VerifyToken(ctx context.Context, idToken string) (*TokenInfo, error) {
	token, err := c.authClient.VerifyIDToken(ctx, idToken)
	if err != nil {
		return nil, fmt.Errorf("verify token: %w", err)
	}

	email, _ := token.Claims["email"].(string)
	emailVerified, _ := token.Claims["email_verified"].(bool)

	return &TokenInfo{
		UID:           token.UID,
		Email:         email,
		EmailVerified: emailVerified,
		Claims:        token.Claims,
	}, nil
}

type UserInfo struct {
	UID         string
	Email       string
	DisplayName string
	PhotoURL    string
	ProviderID  string
}

func (c *Client) GetUser(ctx context.Context, uid string) (*UserInfo, error) {
	user, err := c.authClient.GetUser(ctx, uid)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}

	info := &UserInfo{
		UID:         user.UID,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		PhotoURL:    user.PhotoURL,
	}

	// Extract GitHub provider data if available
	for _, p := range user.ProviderUserInfo {
		if p.ProviderID == "github.com" {
			info.ProviderID = "github.com"
			if info.DisplayName == "" {
				info.DisplayName = p.DisplayName
			}
			if info.PhotoURL == "" {
				info.PhotoURL = p.PhotoURL
			}
			break
		}
	}

	return info, nil
}
```

**Step 2: Verify it compiles**

```bash
cd backend && go build ./...
```

**Step 3: Commit**

```bash
git add backend/internal/firebase/
git commit -m "feat: add Firebase Admin SDK wrapper for token verification"
```

---

## Task 7: Redis client

**Files:**
- Create: `backend/internal/redis/redis.go`

**Step 1: Write Redis client**

Create `internal/redis/redis.go`:

```go
package redis

import (
	"context"
	"log/slog"

	"github.com/redis/go-redis/v9"
)

func NewClient(ctx context.Context, redisURL string) *redis.Client {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		slog.Warn("invalid redis URL, rate limiting will use in-memory fallback", "error", err)
		return nil
	}

	client := redis.NewClient(opts)
	if err := client.Ping(ctx).Err(); err != nil {
		slog.Warn("redis connection failed, rate limiting will use in-memory fallback", "error", err)
		return nil
	}

	slog.Info("redis connected", "addr", opts.Addr)
	return client
}
```

**Step 2: Commit**

```bash
git add backend/internal/redis/
git commit -m "feat: add Redis client with graceful fallback"
```

---

## Task 8: Middleware stack

**Files:**
- Create: `backend/internal/middleware/requestid.go`
- Create: `backend/internal/middleware/security.go`
- Create: `backend/internal/middleware/requestsize.go`
- Create: `backend/internal/middleware/ratelimit.go`
- Create: `backend/internal/middleware/auth.go`
- Create: `backend/internal/middleware/logging.go`

**Step 1: Write request ID middleware**

Create `internal/middleware/requestid.go`:

```go
package middleware

import (
	"context"
	"net/http"

	"github.com/google/uuid"
)

type ctxKeyRequestID struct{}

func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := uuid.New().String()
		w.Header().Set("X-Request-ID", id)
		ctx := context.WithValue(r.Context(), ctxKeyRequestID{}, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func GetRequestID(ctx context.Context) string {
	id, _ := ctx.Value(ctxKeyRequestID{}).(string)
	return id
}
```

**Step 2: Write security headers middleware**

Create `internal/middleware/security.go`:

```go
package middleware

import "net/http"

func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-XSS-Protection", "1; mode=block")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), geolocation=(), microphone=(), payment=()")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'")
		next.ServeHTTP(w, r)
	})
}
```

**Step 3: Write request size limiter**

Create `internal/middleware/requestsize.go`:

```go
package middleware

import (
	"net/http"

	"github.com/nishantg96/gitfable/internal/handler"
)

const MaxRequestSize = 1 << 20 // 1MB

func LimitRequestSize(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.ContentLength > MaxRequestSize {
			handler.Error(w, http.StatusRequestEntityTooLarge, handler.ErrCodeTooLarge, "Request body too large")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, MaxRequestSize)
		next.ServeHTTP(w, r)
	})
}
```

**Step 4: Write rate limiter**

Create `internal/middleware/ratelimit.go`:

```go
package middleware

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/nishantg96/gitfable/internal/handler"
	goredis "github.com/redis/go-redis/v9"
)

type RateLimiter struct {
	redis  *goredis.Client // nil = use in-memory
	local  map[string][]time.Time
	mu     sync.Mutex
	limits map[string]rateConfig
}

type rateConfig struct {
	requests int
	window   time.Duration
}

func NewRateLimiter(redisClient *goredis.Client) *RateLimiter {
	return &RateLimiter{
		redis: redisClient,
		local: make(map[string][]time.Time),
		limits: map[string]rateConfig{
			"auth":    {requests: 10, window: time.Minute},
			"draws":   {requests: 5, window: time.Minute},
			"default": {requests: 100, window: time.Minute},
		},
	}
}

func (rl *RateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		category := rl.categorize(r.URL.Path)
		clientID := rl.clientID(r)
		key := fmt.Sprintf("ratelimit:%s:%s", clientID, category)

		cfg := rl.limits[category]
		remaining, resetAt, allowed := rl.check(r.Context(), key, cfg)

		w.Header().Set("X-RateLimit-Remaining", strconv.Itoa(remaining))
		w.Header().Set("X-RateLimit-Reset", strconv.FormatInt(resetAt, 10))

		if !allowed {
			w.Header().Set("Retry-After", strconv.FormatInt(resetAt-time.Now().Unix(), 10))
			handler.Error(w, http.StatusTooManyRequests, handler.ErrCodeRateLimited, "Rate limit exceeded")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (rl *RateLimiter) categorize(path string) string {
	if strings.Contains(path, "/auth") {
		return "auth"
	}
	if strings.Contains(path, "/draws") {
		return "draws"
	}
	return "default"
}

func (rl *RateLimiter) clientID(r *http.Request) string {
	// Check for authenticated user in context
	if user := UserFromContext(r.Context()); user != nil {
		return fmt.Sprintf("user:%d", user.ID)
	}
	// Fall back to IP
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		return strings.Split(xff, ",")[0]
	}
	return r.RemoteAddr
}

func (rl *RateLimiter) check(ctx context.Context, key string, cfg rateConfig) (remaining int, resetAt int64, allowed bool) {
	now := time.Now()
	resetAt = now.Add(cfg.window).Unix()

	if rl.redis != nil {
		return rl.checkRedis(ctx, key, cfg, now)
	}
	return rl.checkLocal(key, cfg, now)
}

func (rl *RateLimiter) checkRedis(ctx context.Context, key string, cfg rateConfig, now time.Time) (int, int64, bool) {
	pipe := rl.redis.Pipeline()
	windowStart := now.Add(-cfg.window)

	pipe.ZRemRangeByScore(ctx, key, "-inf", fmt.Sprintf("%d", windowStart.UnixNano()))
	pipe.ZAdd(ctx, key, goredis.Z{Score: float64(now.UnixNano()), Member: now.UnixNano()})
	countCmd := pipe.ZCard(ctx, key)
	pipe.Expire(ctx, key, cfg.window)

	if _, err := pipe.Exec(ctx); err != nil {
		// Redis error — allow request
		return cfg.requests, now.Add(cfg.window).Unix(), true
	}

	count := int(countCmd.Val())
	remaining := cfg.requests - count
	if remaining < 0 {
		remaining = 0
	}
	return remaining, now.Add(cfg.window).Unix(), count <= cfg.requests
}

func (rl *RateLimiter) checkLocal(key string, cfg rateConfig, now time.Time) (int, int64, bool) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	windowStart := now.Add(-cfg.window)
	timestamps := rl.local[key]

	// Remove expired entries
	valid := timestamps[:0]
	for _, t := range timestamps {
		if t.After(windowStart) {
			valid = append(valid, t)
		}
	}
	valid = append(valid, now)
	rl.local[key] = valid

	remaining := cfg.requests - len(valid)
	if remaining < 0 {
		remaining = 0
	}
	return remaining, now.Add(cfg.window).Unix(), len(valid) <= cfg.requests
}
```

**Step 5: Write auth middleware**

Create `internal/middleware/auth.go`:

```go
package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/firebase"
	"github.com/nishantg96/gitfable/internal/handler"
)

type ctxKeyUser struct{}

type AuthMiddleware struct {
	fb      *firebase.Client
	queries *database.Queries
}

func NewAuthMiddleware(fb *firebase.Client, q *database.Queries) *AuthMiddleware {
	return &AuthMiddleware{fb: fb, queries: q}
}

func (a *AuthMiddleware) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" || !strings.HasPrefix(authHeader, "Bearer ") {
			handler.Unauthorized(w)
			return
		}

		token := strings.TrimPrefix(authHeader, "Bearer ")
		tokenInfo, err := a.fb.VerifyToken(r.Context(), token)
		if err != nil {
			handler.Unauthorized(w)
			return
		}

		user, err := a.queries.GetUserByFirebaseUID(r.Context(), tokenInfo.UID)
		if err != nil {
			handler.Unauthorized(w)
			return
		}

		if user.Status != database.UserStatusActive {
			handler.Forbidden(w, "Account is disabled")
			return
		}

		ctx := context.WithValue(r.Context(), ctxKeyUser{}, &user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func UserFromContext(ctx context.Context) *database.User {
	user, _ := ctx.Value(ctxKeyUser{}).(*database.User)
	return user
}
```

**Step 6: Write logging middleware**

Create `internal/middleware/logging.go`:

```go
package middleware

import (
	"log/slog"
	"net/http"
	"time"
)

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func Logger(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: 200}

		next.ServeHTTP(rec, r)

		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rec.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"request_id", GetRequestID(r.Context()),
		)
	})
}
```

**Step 7: Verify it compiles**

```bash
cd backend && go build ./...
```

**Step 8: Commit**

```bash
git add backend/internal/middleware/
git commit -m "feat: add middleware stack (request ID, security, rate limit, auth, logging)"
```

---

## Task 9: Service layer — XP and Streaks

**Files:**
- Create: `backend/internal/service/xp.go`
- Create: `backend/internal/service/xp_test.go`
- Create: `backend/internal/service/streaks.go`
- Create: `backend/internal/service/streaks_test.go`

**Step 1: Write XP tests**

Create `internal/service/xp_test.go`:

```go
package service

import "testing"

func TestCalcLevel(t *testing.T) {
	tests := []struct {
		xp    int
		level int
	}{
		{0, 1},
		{499, 1},
		{500, 2},
		{999, 2},
		{1000, 3},
		{5000, 11},
	}
	for _, tt := range tests {
		if got := CalcLevel(tt.xp); got != tt.level {
			t.Errorf("CalcLevel(%d) = %d, want %d", tt.xp, got, tt.level)
		}
	}
}
```

**Step 2: Run test to verify it fails**

```bash
cd backend && go test ./internal/service/ -run TestCalcLevel -v
```

Expected: FAIL — `CalcLevel` not defined.

**Step 3: Write XP service**

Create `internal/service/xp.go`:

```go
package service

import (
	"context"

	"github.com/nishantg96/gitfable/internal/database"
)

type XPStore interface {
	GetUserByID(ctx context.Context, id int64) (database.User, error)
	UpdateUserXP(ctx context.Context, arg database.UpdateUserXPParams) (database.User, error)
}

type XPService struct {
	store XPStore
}

func NewXPService(store XPStore) *XPService {
	return &XPService{store: store}
}

func CalcLevel(xp int) int {
	return (xp / 500) + 1
}

func (s *XPService) AwardXP(ctx context.Context, userID int64, amount int) (newXP, newLevel int, err error) {
	user, err := s.store.GetUserByID(ctx, userID)
	if err != nil {
		return 0, 0, err
	}

	newXP = int(user.Xp) + amount
	newLevel = CalcLevel(newXP)

	_, err = s.store.UpdateUserXP(ctx, database.UpdateUserXPParams{
		ID:    userID,
		Xp:    int32(newXP),
		Level: int32(newLevel),
	})
	if err != nil {
		return 0, 0, err
	}

	return newXP, newLevel, nil
}
```

**Step 4: Run test to verify it passes**

```bash
cd backend && go test ./internal/service/ -run TestCalcLevel -v
```

Expected: PASS

**Step 5: Write streak tests**

Create `internal/service/streaks_test.go`:

```go
package service

import (
	"testing"
	"time"
)

func TestCalcStreak(t *testing.T) {
	now := time.Now()

	tests := []struct {
		name           string
		current        int
		longest        int
		lastContrib    time.Time
		wantCurrent    int
		wantLongest    int
	}{
		{"first contribution", 0, 0, time.Time{}, 1, 1},
		{"within 24h no change", 5, 10, now.Add(-12 * time.Hour), 5, 10},
		{"next day increment", 5, 10, now.Add(-30 * time.Hour), 6, 10},
		{"next day new longest", 10, 10, now.Add(-30 * time.Hour), 11, 11},
		{"gap resets", 5, 10, now.Add(-72 * time.Hour), 1, 10},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			current, longest := CalcStreak(tt.current, tt.longest, tt.lastContrib, now)
			if current != tt.wantCurrent || longest != tt.wantLongest {
				t.Errorf("CalcStreak() = (%d, %d), want (%d, %d)", current, longest, tt.wantCurrent, tt.wantLongest)
			}
		})
	}
}
```

**Step 6: Run test to verify it fails**

```bash
cd backend && go test ./internal/service/ -run TestCalcStreak -v
```

Expected: FAIL

**Step 7: Write streak service**

Create `internal/service/streaks.go`:

```go
package service

import (
	"context"
	"database/sql"
	"time"

	"github.com/nishantg96/gitfable/internal/database"
)

type StreakStore interface {
	GetUserByID(ctx context.Context, id int64) (database.User, error)
	UpdateUserStreak(ctx context.Context, arg database.UpdateUserStreakParams) error
}

type StreakService struct {
	store StreakStore
}

func NewStreakService(store StreakStore) *StreakService {
	return &StreakService{store: store}
}

// CalcStreak is a pure function for testability.
func CalcStreak(currentStreak, longestStreak int, lastContrib, now time.Time) (newCurrent, newLongest int) {
	if lastContrib.IsZero() {
		return 1, max(longestStreak, 1)
	}

	hours := now.Sub(lastContrib).Hours()

	switch {
	case hours < 24:
		// Same day — no change
		return currentStreak, longestStreak
	case hours < 48:
		// Next day — increment
		newCurrent = currentStreak + 1
	default:
		// Gap — reset
		newCurrent = 1
	}

	newLongest = max(longestStreak, newCurrent)
	return newCurrent, newLongest
}

func (s *StreakService) UpdateStreak(ctx context.Context, userID int64) error {
	user, err := s.store.GetUserByID(ctx, userID)
	if err != nil {
		return err
	}

	var lastContrib time.Time
	if user.LastContributionDate.Valid {
		lastContrib = user.LastContributionDate.Time
	}

	now := time.Now()
	newCurrent, newLongest := CalcStreak(int(user.CurrentStreak), int(user.LongestStreak), lastContrib, now)

	return s.store.UpdateUserStreak(ctx, database.UpdateUserStreakParams{
		ID:                   userID,
		CurrentStreak:        int32(newCurrent),
		LongestStreak:        int32(newLongest),
		LastContributionDate: sql.NullTime{Time: now, Valid: true},
	})
}
```

**Step 8: Run all tests**

```bash
cd backend && go test ./internal/service/ -v
```

Expected: All PASS

**Step 9: Commit**

```bash
git add backend/internal/service/
git commit -m "feat: add XP and streak services with unit tests"
```

---

## Task 10: Service layer — Badges

**Files:**
- Create: `backend/internal/service/badges.go`
- Create: `backend/internal/service/badges_test.go`

**Step 1: Write badge condition tests**

Create `internal/service/badges_test.go`:

```go
package service

import (
	"testing"
	"time"
)

func TestBadgeConditions(t *testing.T) {
	midnight := time.Date(2025, 1, 1, 2, 0, 0, 0, time.UTC)
	afternoon := time.Date(2025, 1, 1, 14, 0, 0, 0, time.UTC)
	drawnAt := time.Date(2025, 1, 1, 10, 0, 0, 0, time.UTC)
	mergedFast := time.Date(2025, 1, 1, 20, 0, 0, 0, time.UTC)   // 10h later
	mergedSlow := time.Date(2025, 1, 3, 10, 0, 0, 0, time.UTC)   // 2 days later

	tests := []struct {
		name      string
		badge     string
		draws     []MergedDraw
		user      BadgeUser
		want      bool
	}{
		{"prologue met", "Prologue", []MergedDraw{{}}, BadgeUser{}, true},
		{"prologue not met", "Prologue", nil, BadgeUser{}, false},
		{"short story 3 draws", "Short Story", make([]MergedDraw, 3), BadgeUser{}, true},
		{"short story 2 draws", "Short Story", make([]MergedDraw, 2), BadgeUser{}, false},
		{"midnight draft met", "Midnight Draft", []MergedDraw{{MergedAt: midnight}}, BadgeUser{}, true},
		{"midnight draft not met", "Midnight Draft", []MergedDraw{{MergedAt: afternoon}}, BadgeUser{}, false},
		{"fast forward met", "Fast Forward", []MergedDraw{{CreatedAt: drawnAt, MergedAt: mergedFast}}, BadgeUser{}, true},
		{"fast forward not met", "Fast Forward", []MergedDraw{{CreatedAt: drawnAt, MergedAt: mergedSlow}}, BadgeUser{}, false},
		{"daily author met", "Daily Author", nil, BadgeUser{LongestStreak: 30}, true},
		{"daily author not met", "Daily Author", nil, BadgeUser{LongestStreak: 29}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var def BadgeDef
			for _, b := range BadgeDefs {
				if b.Name == tt.badge {
					def = b
					break
				}
			}
			if def.Name == "" {
				t.Fatalf("badge %q not found", tt.badge)
			}
			if got := def.Check(tt.draws, tt.user); got != tt.want {
				t.Errorf("%s check = %v, want %v", tt.badge, got, tt.want)
			}
		})
	}
}
```

**Step 2: Run test to verify it fails**

```bash
cd backend && go test ./internal/service/ -run TestBadgeConditions -v
```

Expected: FAIL

**Step 3: Write badge service**

Create `internal/service/badges.go`:

```go
package service

import (
	"context"
	"strings"
	"time"

	"github.com/nishantg96/gitfable/internal/database"
)

type MergedDraw struct {
	RepoOwner  string
	RepoName   string
	Language   string
	Labels     []string
	Difficulty string
	MergedAt   time.Time
	CreatedAt  time.Time
}

type BadgeUser struct {
	LongestStreak int
}

type BadgeDef struct {
	Name        string
	Description string
	Icon        string
	Check       func(draws []MergedDraw, user BadgeUser) bool
}

var BadgeDefs = []BadgeDef{
	{
		Name: "Prologue", Description: "Merge your first PR", Icon: "book-open",
		Check: func(d []MergedDraw, u BadgeUser) bool { return len(d) >= 1 },
	},
	{
		Name: "Short Story", Description: "Merge 3 PRs", Icon: "book",
		Check: func(d []MergedDraw, u BadgeUser) bool { return len(d) >= 3 },
	},
	{
		Name: "The Epic", Description: "Merge 100 PRs", Icon: "library",
		Check: func(d []MergedDraw, u BadgeUser) bool { return len(d) >= 100 },
	},
	{
		Name: "Anthology", Description: "Merge PRs in 5+ languages", Icon: "languages",
		Check: func(d []MergedDraw, u BadgeUser) bool {
			langs := make(map[string]bool)
			for _, draw := range d {
				if draw.Language != "" {
					langs[draw.Language] = true
				}
			}
			return len(langs) >= 5
		},
	},
	{
		Name: "Midnight Draft", Description: "Merge a PR between midnight and 5am", Icon: "moon",
		Check: func(d []MergedDraw, u BadgeUser) bool {
			for _, draw := range d {
				if draw.MergedAt.Hour() < 5 {
					return true
				}
			}
			return false
		},
	},
	{
		Name: "Fast Forward", Description: "Merge a PR within 24h of drawing it", Icon: "zap",
		Check: func(d []MergedDraw, u BadgeUser) bool {
			for _, draw := range d {
				if !draw.CreatedAt.IsZero() && draw.MergedAt.Sub(draw.CreatedAt).Hours() < 24 {
					return true
				}
			}
			return false
		},
	},
	{
		Name: "Daily Author", Description: "Achieve a 30-day streak", Icon: "flame",
		Check: func(d []MergedDraw, u BadgeUser) bool { return u.LongestStreak >= 30 },
	},
	{
		Name: "Worldbuilder", Description: "Contribute to 10+ different repos", Icon: "globe",
		Check: func(d []MergedDraw, u BadgeUser) bool {
			repos := make(map[string]bool)
			for _, draw := range d {
				repos[draw.RepoOwner+"/"+draw.RepoName] = true
			}
			return len(repos) >= 10
		},
	},
	{
		Name: "Proofreader", Description: "Merge 10 bug-fix PRs", Icon: "bug",
		Check: func(d []MergedDraw, u BadgeUser) bool {
			count := 0
			for _, draw := range d {
				for _, l := range draw.Labels {
					if strings.Contains(strings.ToLower(l), "bug") {
						count++
						break
					}
				}
			}
			return count >= 10
		},
	},
	{
		Name: "The Archivist", Description: "Merge 10 documentation PRs", Icon: "file-text",
		Check: func(d []MergedDraw, u BadgeUser) bool {
			count := 0
			for _, draw := range d {
				for _, l := range draw.Labels {
					if strings.Contains(strings.ToLower(l), "doc") {
						count++
						break
					}
				}
			}
			return count >= 10
		},
	},
}

type BadgeStore interface {
	GetUserBadgeNames(ctx context.Context, userID int64) ([]string, error)
	GetBadgeByName(ctx context.Context, name string) (database.Badge, error)
	AwardBadge(ctx context.Context, arg database.AwardBadgeParams) (database.UserBadge, error)
	GetUserMergedDrawsWithIssues(ctx context.Context, userID int64) ([]database.GetUserMergedDrawsWithIssuesRow, error)
	GetUserByID(ctx context.Context, id int64) (database.User, error)
	UpsertBadge(ctx context.Context, arg database.UpsertBadgeParams) error
}

type BadgeService struct {
	store BadgeStore
}

func NewBadgeService(store BadgeStore) *BadgeService {
	return &BadgeService{store: store}
}

func (s *BadgeService) InitializeBadges(ctx context.Context) error {
	for _, def := range BadgeDefs {
		if err := s.store.UpsertBadge(ctx, database.UpsertBadgeParams{
			Name:        def.Name,
			Description: def.Description,
			Icon:        def.Icon,
		}); err != nil {
			return err
		}
	}
	return nil
}

type AwardedBadge struct {
	Name      string    `json:"name"`
	EarnedAt  time.Time `json:"earned_at"`
}

func (s *BadgeService) CheckBadges(ctx context.Context, userID int64, drawID *int64) ([]AwardedBadge, error) {
	// Get already earned badge names
	earned, err := s.store.GetUserBadgeNames(ctx, userID)
	if err != nil {
		return nil, err
	}
	earnedSet := make(map[string]bool, len(earned))
	for _, name := range earned {
		earnedSet[name] = true
	}

	// Get merged draws with issue data
	rows, err := s.store.GetUserMergedDrawsWithIssues(ctx, userID)
	if err != nil {
		return nil, err
	}

	draws := make([]MergedDraw, len(rows))
	for i, r := range rows {
		draws[i] = MergedDraw{
			RepoOwner:  r.RepoOwner,
			RepoName:   r.RepoName,
			Language:   r.Language.(string), // handle nullable in implementation
			Labels:     r.Labels,
			Difficulty: r.Difficulty.(string),
			MergedAt:   r.MergedAt.(time.Time),
			CreatedAt:  r.CreatedAt,
		}
	}

	// Get user for streak info
	user, err := s.store.GetUserByID(ctx, userID)
	if err != nil {
		return nil, err
	}
	bu := BadgeUser{LongestStreak: int(user.LongestStreak)}

	// Check each badge
	var awarded []AwardedBadge
	for _, def := range BadgeDefs {
		if earnedSet[def.Name] {
			continue
		}
		if !def.Check(draws, bu) {
			continue
		}

		badge, err := s.store.GetBadgeByName(ctx, def.Name)
		if err != nil {
			continue
		}

		var dID *int64
		if drawID != nil {
			dID = drawID
		}

		ub, err := s.store.AwardBadge(ctx, database.AwardBadgeParams{
			UserID:  userID,
			BadgeID: badge.ID,
			DrawID:  dID, // may need sql.NullInt64 depending on sqlc output
		})
		if err != nil {
			continue // ON CONFLICT DO NOTHING — race condition safe
		}

		awarded = append(awarded, AwardedBadge{Name: def.Name, EarnedAt: ub.EarnedAt})
	}

	return awarded, nil
}
```

Note: The exact types for nullable fields (Language, Difficulty, MergedAt, DrawID) will depend on sqlc-generated types. Adjust type assertions during implementation.

**Step 4: Run tests**

```bash
cd backend && go test ./internal/service/ -run TestBadgeConditions -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/internal/service/badges.go backend/internal/service/badges_test.go
git commit -m "feat: add badge service with 10 badge definitions and unit tests"
```

---

## Task 11: Service layer — GitHub PR verification

**Files:**
- Create: `backend/internal/service/github.go`
- Create: `backend/internal/service/github_test.go`

**Step 1: Write PR URL parser tests**

Create `internal/service/github_test.go`:

```go
package service

import "testing"

func TestParsePRURL(t *testing.T) {
	tests := []struct {
		url       string
		owner     string
		repo      string
		number    int
		wantErr   bool
	}{
		{"https://github.com/facebook/react/pull/123", "facebook", "react", 123, false},
		{"https://github.com/rust-lang/rust/pull/1", "rust-lang", "rust", 1, false},
		{"https://github.com/a/b/pull/0", "a", "b", 0, true},
		{"https://gitlab.com/a/b/pull/1", "", "", 0, true},
		{"not-a-url", "", "", 0, true},
		{"https://github.com/a/b/issues/1", "", "", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.url, func(t *testing.T) {
			owner, repo, number, err := ParsePRURL(tt.url)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParsePRURL(%q) error = %v, wantErr %v", tt.url, err, tt.wantErr)
				return
			}
			if !tt.wantErr {
				if owner != tt.owner || repo != tt.repo || number != tt.number {
					t.Errorf("ParsePRURL(%q) = (%q, %q, %d), want (%q, %q, %d)", tt.url, owner, repo, number, tt.owner, tt.repo, tt.number)
				}
			}
		})
	}
}
```

**Step 2: Run test to verify it fails**

```bash
cd backend && go test ./internal/service/ -run TestParsePRURL -v
```

Expected: FAIL

**Step 3: Write GitHub service**

Create `internal/service/github.go`:

```go
package service

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"time"
)

var prURLRegex = regexp.MustCompile(`^https://github\.com/([a-zA-Z0-9_.-]+)/([a-zA-Z0-9_.-]+)/pull/(\d+)$`)

func ParsePRURL(url string) (owner, repo string, number int, err error) {
	matches := prURLRegex.FindStringSubmatch(url)
	if matches == nil {
		return "", "", 0, fmt.Errorf("invalid PR URL format")
	}

	number, err = strconv.Atoi(matches[3])
	if err != nil || number < 1 {
		return "", "", 0, fmt.Errorf("invalid PR number")
	}

	return matches[1], matches[2], number, nil
}

type PRStatus struct {
	State          string `json:"state"`
	Merged         bool   `json:"merged"`
	MergedAt       string `json:"merged_at"`
	MergeCommitSHA string `json:"merge_commit_sha"`
	UserLogin      string `json:"user_login"`
	Title          string `json:"title"`
	HTMLURL        string `json:"html_url"`
}

type GitHubClient interface {
	GetPRStatus(ctx context.Context, owner, repo string, number int) (*PRStatus, error)
}

type githubClient struct {
	httpClient *http.Client
}

func NewGitHubClient() GitHubClient {
	return &githubClient{
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

func (c *githubClient) GetPRStatus(ctx context.Context, owner, repo string, number int) (*PRStatus, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls/%d", owner, repo, number)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("github api request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("PR not found")
	}
	if resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("github API rate limited")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github API returned %d", resp.StatusCode)
	}

	var pr struct {
		State          string `json:"state"`
		Merged         bool   `json:"merged"`
		MergedAt       string `json:"merged_at"`
		MergeCommitSHA string `json:"merge_commit_sha"`
		User           struct {
			Login string `json:"login"`
		} `json:"user"`
		Title   string `json:"title"`
		HTMLURL string `json:"html_url"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&pr); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	return &PRStatus{
		State:          pr.State,
		Merged:         pr.Merged,
		MergedAt:       pr.MergedAt,
		MergeCommitSHA: pr.MergeCommitSHA,
		UserLogin:      pr.User.Login,
		Title:          pr.Title,
		HTMLURL:        pr.HTMLURL,
	}, nil
}

func VerifyWebhookSignature(payload []byte, signature, secret string) bool {
	if secret == "" || signature == "" {
		return false
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	expected := "sha256=" + hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(expected), []byte(signature))
}
```

**Step 4: Run tests**

```bash
cd backend && go test ./internal/service/ -run TestParsePRURL -v
```

Expected: PASS

**Step 5: Commit**

```bash
git add backend/internal/service/github.go backend/internal/service/github_test.go
git commit -m "feat: add GitHub PR verification service with URL parser and webhook signature check"
```

---

## Task 12: Handlers — Health and Auth

**Files:**
- Create: `backend/internal/handler/health.go`
- Create: `backend/internal/handler/auth.go`

**Step 1: Write health handler**

Create `internal/handler/health.go`:

```go
package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	goredis "github.com/redis/go-redis/v9"
)

type HealthHandler struct {
	db    *pgxpool.Pool
	redis *goredis.Client
}

func NewHealthHandler(db *pgxpool.Pool, redis *goredis.Client) *HealthHandler {
	return &HealthHandler{db: db, redis: redis}
}

func (h *HealthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Get("/health", h.Health)
	r.Get("/ready", h.Ready)
	return r
}

func (h *HealthHandler) Health(w http.ResponseWriter, r *http.Request) {
	OK(w, map[string]string{"status": "healthy"})
}

func (h *HealthHandler) Ready(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	result := map[string]string{"status": "ready"}

	if err := h.db.Ping(ctx); err != nil {
		result["status"] = "not_ready"
		result["database"] = "disconnected"
		Error(w, http.StatusServiceUnavailable, "NOT_READY", "Database unavailable")
		return
	}
	result["database"] = "connected"

	if h.redis != nil {
		if err := h.redis.Ping(ctx).Err(); err != nil {
			result["redis"] = "disconnected"
		} else {
			result["redis"] = "connected"
		}
	}

	OK(w, result)
}
```

**Step 2: Write auth handler**

Create `internal/handler/auth.go`:

```go
package handler

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/nishantg96/gitfable/internal/database"
	"github.com/nishantg96/gitfable/internal/firebase"
	"github.com/nishantg96/gitfable/internal/middleware"
)

var usernameRegex = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,37}[a-z0-9]$`)

type AuthHandler struct {
	queries  *database.Queries
	firebase *firebase.Client
	auth     *middleware.AuthMiddleware
}

func NewAuthHandler(q *database.Queries, fb *firebase.Client, auth *middleware.AuthMiddleware) *AuthHandler {
	return &AuthHandler{queries: q, firebase: fb, auth: auth}
}

func (h *AuthHandler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/register", h.Register)

	// Protected routes
	r.Group(func(r chi.Router) {
		r.Use(h.auth.RequireAuth)
		r.Get("/me", h.Me)
		r.Put("/me", h.UpdateMe)
	})

	return r
}

type RegisterRequest struct {
	FirebaseUID string `json:"firebase_uid"`
	Username    string `json:"username"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	PhotoURL    string `json:"photo_url"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req RegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid request body")
		return
	}

	// Validate username
	username := strings.ToLower(strings.TrimSpace(req.Username))
	if !usernameRegex.MatchString(username) || strings.Contains(username, "--") {
		BadRequest(w, ErrCodeBadRequest, "Username must be 2-39 chars, lowercase alphanumeric and hyphens, no consecutive hyphens")
		return
	}

	// Check username taken
	if _, err := h.queries.GetUserByUsername(r.Context(), username); err == nil {
		Error(w, http.StatusConflict, ErrCodeUsernameTaken, "Username already taken")
		return
	}

	// Get GitHub info from Firebase if available
	var githubID, githubUsername *string
	fbUser, err := h.firebase.GetUser(r.Context(), req.FirebaseUID)
	if err == nil && fbUser.ProviderID == "github.com" {
		githubID = &fbUser.UID
		githubUsername = &fbUser.DisplayName
	}

	user, err := h.queries.CreateUser(r.Context(), database.CreateUserParams{
		FirebaseUid:    req.FirebaseUID,
		Username:       username,
		Email:          req.Email,
		DisplayName:    req.DisplayName,
		AvatarUrl:      req.PhotoURL,
		GithubId:       githubID,
		GithubUsername: githubUsername,
	})
	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			Error(w, http.StatusConflict, ErrCodeEmailTaken, "Email already registered")
			return
		}
		InternalError(w)
		return
	}

	Created(w, userToResponse(user))
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())
	OK(w, userToResponse(*user))
}

type UpdateProfileRequest struct {
	DisplayName *string `json:"display_name"`
	AvatarURL   *string `json:"avatar_url"`
}

func (h *AuthHandler) UpdateMe(w http.ResponseWriter, r *http.Request) {
	user := middleware.UserFromContext(r.Context())

	var req UpdateProfileRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		BadRequest(w, ErrCodeBadRequest, "Invalid request body")
		return
	}

	displayName := user.DisplayName
	avatarURL := user.AvatarUrl
	if req.DisplayName != nil {
		displayName = *req.DisplayName
	}
	if req.AvatarURL != nil {
		avatarURL = *req.AvatarURL
	}

	updated, err := h.queries.UpdateUserProfile(r.Context(), database.UpdateUserProfileParams{
		ID:          user.ID,
		DisplayName: displayName,
		AvatarUrl:   avatarURL,
	})
	if err != nil {
		InternalError(w)
		return
	}

	OK(w, userToResponse(updated))
}

// userToResponse converts DB user to API response, hiding internal ID
func userToResponse(u database.User) map[string]any {
	return map[string]any{
		"id":                  u.PublicID,
		"username":            u.Username,
		"email":               u.Email,
		"display_name":        u.DisplayName,
		"avatar_url":          u.AvatarUrl,
		"github_username":     u.GithubUsername,
		"xp":                  u.Xp,
		"level":               u.Level,
		"current_streak":      u.CurrentStreak,
		"longest_streak":      u.LongestStreak,
		"total_contributions": u.TotalContributions,
		"filters":             u.Filters,
		"status":              u.Status,
		"created_at":          u.CreatedAt,
	}
}
```

Note: The exact field types (nullable fields like `GithubId`, `GithubUsername`) will depend on sqlc-generated code. Adjust pointer/sql.Null types during implementation.

**Step 3: Verify it compiles**

```bash
cd backend && go build ./...
```

**Step 4: Commit**

```bash
git add backend/internal/handler/
git commit -m "feat: add health and auth handlers"
```

---

## Task 13: Handlers — Draws

**Files:**
- Create: `backend/internal/handler/draws.go`

This is the largest handler. Implements: draw, choose, status transitions, PR submission, PR verification, and history.

**Step 1: Write draws handler**

Create `internal/handler/draws.go` with all draw endpoints. Key methods:

- `Draw` — check daily limit (COUNT draws today), get random issue, create draw, award 10 XP
- `Choose` — validate issue exists, create draw, award 5 XP
- `UpdateStatus` — validate state transition (drawn→bookmarked, bookmarked→expired, *→abandoned), check single active bookmark
- `SubmitPR` — validate PR URL regex, update draw with PR URL, award 25 XP
- `Verify` — call GitHub API, check merged, award 100 XP, update streak, check badges, create activity, all in one transaction
- `History` — cursor-paginated list with optional status filter

Each mutation that involves XP/badges/streaks uses an explicit `pgx.Tx`:

```go
tx, err := h.pool.Begin(r.Context())
if err != nil { ... }
defer tx.Rollback(r.Context())
qtx := h.queries.WithTx(tx)
// ... all operations ...
tx.Commit(r.Context())
```

**Step 2: Verify it compiles**

```bash
cd backend && go build ./...
```

**Step 3: Commit**

```bash
git add backend/internal/handler/draws.go
git commit -m "feat: add draws handler with state machine, XP, badges, and transactions"
```

---

## Task 14: Handlers — Users and Public

**Files:**
- Create: `backend/internal/handler/users.go`
- Create: `backend/internal/handler/public.go`

**Step 1: Write users handler**

`users.go` implements:
- `Dashboard` — returns user, last 5 merged draws with issues, 365-day heatmap, badges
- `Profile` — public profile by username, recent merged draws, badges
- `UpdateFilters` — update user filters JSONB

**Step 2: Write public handler**

`public.go` implements:
- `ListIssues` — cursor-paginated, optional language/difficulty filter
- `Leaderboard` — cursor-paginated, sorted by XP DESC
- `Stats` — merged draws count, active users count, distinct repos count
- `Activity` — cursor-paginated recent activity feed with user join

**Step 3: Verify it compiles**

```bash
cd backend && go build ./...
```

**Step 4: Commit**

```bash
git add backend/internal/handler/users.go backend/internal/handler/public.go
git commit -m "feat: add users and public handlers with cursor pagination"
```

---

## Task 15: Handlers — Webhooks

**Files:**
- Create: `backend/internal/handler/webhooks.go`

**Step 1: Write webhook handler**

Implements GitHub webhook for `pull_request` events with `action=closed`:
- Verify HMAC-SHA256 signature
- Parse PR URL from payload
- Find draw by `pr_url` with status `pr_submitted`
- In a transaction: merge draw, award 100 XP, update streak, check badges, create activity
- Return success with draw ID and XP awarded

**Step 2: Commit**

```bash
git add backend/internal/handler/webhooks.go
git commit -m "feat: add GitHub webhook handler with signature verification"
```

---

## Task 16: Wire everything in main.go and router setup

**Files:**
- Modify: `backend/cmd/server/main.go`

**Step 1: Update main.go to wire all components**

Replace the placeholder main.go with full wiring:
1. Load config
2. Connect to database pool
3. Run migrations (in dev)
4. Initialize sqlc queries
5. Initialize Firebase client
6. Initialize Redis client (nullable)
7. Initialize services (XP, badges, streaks, GitHub)
8. Initialize middleware (auth, rate limiter)
9. Initialize handlers
10. Build Chi router with middleware chain and route groups
11. Initialize badges in DB
12. Seed data (in dev)
13. Start server with graceful shutdown

Router structure:
```go
r := chi.NewRouter()

// Global middleware
r.Use(middleware.RequestID)
r.Use(chimiddleware.Recoverer)
r.Use(middleware.LimitRequestSize)
r.Use(middleware.SecurityHeaders)
r.Use(rateLimiter.Middleware)
r.Use(cors.Handler(corsOptions))
r.Use(middleware.Logger)

// Health (no version prefix)
r.Mount("/", healthHandler.Routes())

// API v1
r.Route("/api/v1", func(r chi.Router) {
    r.Mount("/auth", authHandler.Routes())
    r.Mount("/draws", drawsHandler.Routes())
    r.Mount("/users", usersHandler.Routes())
    r.Mount("/issues", publicHandler.IssueRoutes())
    r.Mount("/leaderboard", publicHandler.LeaderboardRoutes())
    r.Get("/stats", publicHandler.Stats)
    r.Get("/activity", publicHandler.Activity)
    r.Mount("/webhooks", webhooksHandler.Routes())
})
```

**Step 2: Verify it compiles and starts**

```bash
cd backend && go build ./cmd/server && echo "BUILD OK"
```

**Step 3: Commit**

```bash
git add backend/cmd/server/main.go
git commit -m "feat: wire all components in main.go with Chi router and graceful shutdown"
```

---

## Task 17: Seed data

**Files:**
- Create: `backend/seed.go`

**Step 1: Write seeder**

Port the 27 mock issues and 8 mock users from Python `seed.py`. Same data, same logic: only seed if issues table is empty and environment is not production.

**Step 2: Commit**

```bash
git add backend/seed.go
git commit -m "feat: add seed data for development (27 issues, 8 users)"
```

---

## Task 18: Dockerfile and docker-compose update

**Files:**
- Create: `backend/Dockerfile` (replace Python Dockerfile)
- Modify: `docker-compose.yml`

**Step 1: Write multi-stage Dockerfile**

```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o server ./cmd/server

FROM alpine:3.19
RUN apk add --no-cache ca-certificates
COPY --from=builder /app/server /server
EXPOSE 8001
CMD ["/server"]
```

**Step 2: Update docker-compose.yml backend service**

Replace Python backend service with Go backend. Remove `uv` references. Update command to just `/server`. Remove volume mount for Python code, add volume mount for creds.

**Step 3: Verify Docker build**

```bash
docker compose build backend
```

Expected: Successful build.

**Step 4: Commit**

```bash
git add backend/Dockerfile docker-compose.yml
git commit -m "feat: add Go multi-stage Dockerfile and update docker-compose"
```

---

## Task 19: Update Makefile

**Files:**
- Modify: `Makefile`

**Step 1: Replace Python targets with Go targets**

Update:
- `install-backend` → `cd backend && go mod download`
- `dev-backend` → `cd backend && air` (or `go run ./cmd/server`)
- `test` → `cd backend && go test ./...`
- `test-integration` → `cd backend && go test -tags=integration ./...`
- `lint` → `cd backend && golangci-lint run`
- Add: `generate` → `cd backend && sqlc generate`
- Add: `migrate-up` / `migrate-down`
- Remove: `add`, `add-dev`, `lock` (UV-specific)

**Step 2: Commit**

```bash
git add Makefile
git commit -m "feat: update Makefile with Go backend targets"
```

---

## Task 20: Integration test with testcontainers

**Files:**
- Create: `backend/internal/handler/handler_test.go`

**Step 1: Write integration test setup**

```go
//go:build integration

package handler_test

import (
	"context"
	"testing"

	"github.com/testcontainers/testcontainers-go/modules/postgres"
)

func setupTestDB(t *testing.T) (*pgxpool.Pool, func()) {
	ctx := context.Background()
	pg, err := postgres.Run(ctx, "postgres:16-alpine",
		postgres.WithDatabase("gitfable_test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
	)
	if err != nil {
		t.Fatal(err)
	}
	// run migrations, return pool and cleanup func
}
```

**Step 2: Write integration test for auth register + me flow**

Test: POST /api/v1/auth/register → GET /api/v1/auth/me with mocked Firebase token.

**Step 3: Write integration test for draw flow**

Test: Create draw → bookmark → submit PR → verify (with mocked GitHub client).

**Step 4: Run integration tests**

```bash
cd backend && go test -tags=integration ./internal/handler/ -v
```

Expected: All PASS

**Step 5: Commit**

```bash
git add backend/internal/handler/handler_test.go
git commit -m "feat: add integration tests with testcontainers for auth and draw flows"
```

---

## Task 21: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Update CLAUDE.md to reflect Go backend**

Replace all Python/FastAPI references with Go/Chi. Update commands, architecture description, and project structure.

**Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for Go backend"
```

---

## Task 22: End-to-end smoke test

**Step 1: Start full stack with Docker**

```bash
make docker-up
```

**Step 2: Verify health endpoint**

```bash
curl http://localhost:8001/health
```

Expected: `{"data":{"status":"healthy"},"error":null}`

**Step 3: Verify readiness endpoint**

```bash
curl http://localhost:8001/ready
```

Expected: `{"data":{"status":"ready","database":"connected","redis":"connected"},"error":null}`

**Step 4: Verify issues seeded**

```bash
curl http://localhost:8001/api/v1/issues
```

Expected: JSON with `data` array of 27 issues.

**Step 5: Verify leaderboard**

```bash
curl http://localhost:8001/api/v1/leaderboard
```

Expected: JSON with `data` array of 8 seeded users.

**Step 6: Verify stats**

```bash
curl http://localhost:8001/api/v1/stats
```

Expected: JSON with `data` containing counts.

**Step 7: Stop stack**

```bash
make docker-down
```
