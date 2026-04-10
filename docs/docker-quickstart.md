# Docker Quick Start

Use this guide to run GitFable locally with Docker.

## Prerequisites

- Docker Engine 20.10+
- Docker Compose 2+

## Setup

```bash
make env
```

Edit `docker/.env` and set local values for:

- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`
- `GITHUB_OAUTH_CALLBACK_URL`
- `JWT_SECRET`
- `GITHUB_TOKEN`

For local development, use this callback URL in your GitHub OAuth App:

```text
http://localhost:8001/api/v1/oauth/github/callback
```

## Start the Stack

```bash
make docker-up
```

Or manually:

```bash
docker compose -f docker/docker-compose.yml up -d
```

Services:

- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8001`
- Health: `http://localhost:8001/health`
- Ready: `http://localhost:8001/ready`

## Logs

```bash
make docker-logs
docker compose -f docker/docker-compose.yml logs backend -f
docker compose -f docker/docker-compose.yml logs frontend -f
docker compose -f docker/docker-compose.yml logs postgres -f
```

## Stop the Stack

```bash
make docker-down
```

## Useful Commands

```bash
make docker-build
make migrate-up
make migrate-down
make generate
docker compose -f docker/docker-compose.yml exec backend sh
docker compose -f docker/docker-compose.yml exec postgres psql -U gitfable -d gitfable
docker compose -f docker/docker-compose.yml exec redis redis-cli
```

## Troubleshooting

### Ports already in use

```bash
lsof -i :3000
lsof -i :8001
lsof -i :5432
```

### Backend will not start

```bash
docker compose -f docker/docker-compose.yml logs backend -f
docker compose -f docker/docker-compose.yml config
```

Common causes:

- missing GitHub OAuth or JWT values in `docker/.env`
- database not ready yet
- invalid environment values

### Reset local data

```bash
docker compose -f docker/docker-compose.yml down -v
docker compose -f docker/docker-compose.yml up -d
make migrate-up
```

## Notes

- `docker/.env` is local-only and should never be committed.
- For contributor testing guidance, see `docs/TESTING.md`.
