# Docker Quick Start Guide

This guide shows you how to run the entire GitFable application using Docker.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2.0+
- ~2GB free disk space

## Quick Start

### 1. Setup Environment

```bash
# Copy environment templates
make env

# Edit docker/.env with your:
# - GitHub OAuth credentials
# - JWT secret
# - GitHub token (GITHUB_TOKEN)
# See docs/github-oauth-setup.md for OAuth setup
```

### 2. Start Everything

```bash
# Build and start all services
make docker-up

# Or manually:
docker compose -f docker/docker-compose.yml up -d
```

This will start:
- **PostgreSQL** on port 5432
- **Redis** on port 6379
- **Backend** on port 8001
- **Frontend** on port 3000

### 3. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:8001
- **API Health**: http://localhost:8001/health
- **API Ready**: http://localhost:8001/ready
- **Swagger Docs**: http://localhost:8001/swagger/index.html

### 4. View Logs

```bash
# All services
make docker-logs

# Just backend
docker compose -f docker/docker-compose.yml logs backend -f

# Just frontend
docker compose -f docker/docker-compose.yml logs frontend -f

# Just database
docker compose -f docker/docker-compose.yml logs postgres -f
```

### 5. Stop Everything

```bash
make docker-down

# Or:
docker compose -f docker/docker-compose.yml down
```

## Development Mode

The development setup includes:
- **Hot reload** for backend (code changes apply immediately)
- **Hot reload** for frontend (if using npm/yarn directly)
- **Persistent volumes** for PostgreSQL and Redis data
- **Network** between all services

### Making Changes

**Backend changes:**
- Edit files in `backend/`
- Changes are automatically detected and reloaded
- No need to restart container

**Frontend changes:**
- For Docker: Edit files, then rebuild: `docker compose -f docker/docker-compose.yml build frontend`
- For hot reload: Use `make dev-frontend` separately

**Database changes:**
- After modifying SQL queries in `backend/sql/queries/`, run:
  ```bash
  make generate  # Regenerate sqlc code
  ```

## Useful Commands

```bash
# Rebuild all images
make docker-build

# Rebuild specific service
docker compose -f docker/docker-compose.yml build backend

# Run a command in the backend container
docker compose -f docker/docker-compose.yml exec backend sh

# Access PostgreSQL
docker compose -f docker/docker-compose.yml exec postgres psql -U gitfable -d gitfable

# Access Redis
docker compose -f docker/docker-compose.yml exec redis redis-cli

# Run database migrations
make migrate-up

# Generate sqlc code
make generate

# Clean everything (removes volumes too!)
make docker-clean
```

## Database Operations

### Migrations

```bash
# Run all pending migrations
make migrate-up

# Rollback last migration
make migrate-down

# Check migration status
cd backend && migrate -path sql/migrations -database "$DATABASE_URL" version
```

### Backup and Restore

```bash
# Backup PostgreSQL
docker compose -f docker/docker-compose.yml exec postgres pg_dump -U gitfable gitfable > backup.sql

# Restore PostgreSQL
docker compose -f docker/docker-compose.yml exec -T postgres psql -U gitfable gitfable < backup.sql

# Backup with compression
docker compose -f docker/docker-compose.yml exec postgres pg_dump -U gitfable gitfable | gzip > backup.sql.gz

# Restore from compressed backup
gunzip < backup.sql.gz | docker compose -f docker/docker-compose.yml exec -T postgres psql -U gitfable gitfable
```

### Reset Database (WARNING: Deletes all data!)

```bash
# Remove volumes and start fresh
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d

# Run migrations
make migrate-up

# Seed with test data (development only)
# This happens automatically in dev mode
```

## Troubleshooting

### Port Already in Use

```bash
# Check what's using port 3000
lsof -i :3000

# Check port 8001
lsof -i :8001

# Check port 5432
lsof -i :5432

# Kill process or change port in docker-compose.yml
```

### PostgreSQL Connection Failed

```bash
# Check PostgreSQL logs
docker compose -f docker/docker-compose.yml logs postgres -f

# Check if PostgreSQL is ready
docker compose -f docker/docker-compose.yml exec postgres pg_isready -U gitfable

# Reset PostgreSQL (WARNING: deletes all data!)
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d postgres
sleep 5
make migrate-up
```

### Backend Won't Start

```bash
# Check logs
docker compose -f docker/docker-compose.yml logs backend -f

# Common issues:
# 1. Missing GitHub OAuth or JWT credentials in docker/.env
# 2. PostgreSQL not ready yet (wait 30 seconds)
# 3. Invalid environment variables
# 4. Port already in use

# Check environment variables
docker compose -f docker/docker-compose.yml config
```

### Hot Reload Not Working

Backend hot reload requires volume mount. Check that `docker/docker-compose.yml` has:

```yaml
backend:
  volumes:
    - ../backend:/app
```

### Container Exits Immediately

```bash
# Check logs
docker compose -f docker/docker-compose.yml logs <service-name> -f

# Check environment variables
docker compose -f docker/docker-compose.yml config

# Check for syntax errors in docker-compose.yml
docker compose -f docker/docker-compose.yml config --quiet
```

### sqlc Generation Fails

```bash
# Ensure sqlc is installed
go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest

# Check SQL syntax
cd backend && sqlc verify

# Generate code
cd backend && sqlc generate
```

## Environment Variables

### Development

Edit `docker/.env`:

```bash
# Required
DATABASE_URL=postgresql://gitfable:gitfable@postgres:5432/gitfable?sslmode=disable
GITHUB_OAUTH_CLIENT_ID=your_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
JWT_SECRET=replace_with_a_strong_random_secret
GITHUB_TOKEN=your_github_token

# Optional
REDIS_URL=redis://redis:6379
CORS_ORIGINS=http://localhost:3000
ENVIRONMENT=development
DEFAULT_DAILY_DRAW_LIMIT=3
```

## Data Persistence

### Development

Data is stored in Docker volumes:
- `postgres_data` - PostgreSQL database files
- `redis_data` - Redis data

```bash
# List volumes
docker volume ls

# Inspect volume
docker volume inspect gitfable_postgres_data

# Backup volume
docker run --rm -v gitfable_postgres_data:/data -v $(pwd):/backup alpine tar czf /backup/postgres-backup.tar.gz -C /data .

# Restore volume
docker run --rm -v gitfable_postgres_data:/data -v $(pwd):/backup alpine sh -c "cd /data && tar xzf /backup/postgres-backup.tar.gz"
```

### Clean Start

To start fresh with empty databases:

```bash
# Remove volumes (WARNING: deletes all data!)
docker compose -f docker/docker-compose.yml down -v

# Start fresh
docker compose -f docker/docker-compose.yml up -d

# Run migrations
make migrate-up
```

## Multi-Architecture Builds

For Apple Silicon (M1/M2) Macs or ARM servers:

```bash
# Build for multiple architectures
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t gitfable-backend:latest ./backend
```

## Updating Images

```bash
# Pull latest base images
docker compose -f docker/docker-compose.yml pull

# Rebuild with latest code
docker compose -f docker/docker-compose.yml up -d --build

# Clean up old images
docker image prune -f
```

## Testing

```bash
# Run backend tests
make test-docker

# Run full workflow tests
make test-full-workflow

# Check service health
curl http://localhost:8001/health
curl http://localhost:8001/ready
```

## Security Best Practices

1. **Never commit `.env` files** - They are in `.gitignore` but double-check
2. **Rotate credentials** regularly (OAuth secrets, JWT secrets, GitHub tokens)
3. **Use strong passwords** for PostgreSQL in any shared environment

## Resources

- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [Dockerfile Best Practices](https://docs.docker.com/develop/develop-images/dockerfile_best-practices/)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
- [Redis Docker Image](https://hub.docker.com/_/redis)
- [GitFable API Documentation](http://localhost:8001/swagger/index.html) (when running locally)
