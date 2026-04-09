# Deployment Runbook

## Architecture

GitFable runs on two Hetzner VPS instances, each running the full stack in Docker Compose:

| Environment | Domain | Branch | Deploy Trigger |
|-------------|--------|--------|----------------|
| Dev | dev.gitfable.app | devel | Auto on push |
| Prod | gitfable.app | main | Manual approval |

Each VPS runs: Caddy (auto-SSL) → Frontend (Nginx) + Backend (Go) + PostgreSQL + Redis

## Stack Per Server

```
Caddy (:80/:443) → /api/* → Backend (:8001)
                  → /*     → Frontend (:80)
PostgreSQL (:5432) — internal only
Redis (:6379) — internal only
```

## Deploy Flow

### Dev (automatic)

1. Push to `devel` branch
2. GitHub Actions: test → build images → push to GHCR → deploy on the dev self-hosted runner → smoke test
3. No manual steps required

### Prod (manual approval)

1. Merge PR to `main`
2. GitHub Actions: test → build images → push to GHCR
3. **Wait for approval** in GitHub `production` environment
4. Deploy on the prod self-hosted runner → smoke test

### What Happens During Deploy

The `scripts/deploy.sh` script:
1. Logs into GHCR
2. Pulls new backend and frontend images
3. Regenerates the VPS env file from GitHub Actions secrets
4. Runs `docker compose up -d --remove-orphans`
5. Waits for backend health check (up to 60s)
6. Runs database migrations
7. Reloads Caddy and reports status

## Image Tags

- Dev: `ghcr.io/nishantg96/gitfable-backend:dev-<sha>` + `latest-dev`
- Prod: `ghcr.io/nishantg96/gitfable-backend:prod-<sha>` + `latest-prod`
- Same pattern for frontend images

## Rollback

### Via GitHub Actions

1. Go to Actions → "Rollback Prod" → Run workflow
2. Enter the image tag to roll back to (e.g., `prod-abc1234`)
3. Enter reason
4. Approve in production environment
5. Automated smoke test runs after rollback

### Manual Rollback

Prefer the GitHub Actions rollback workflow because it already supplies the full secret set expected by `scripts/deploy.sh`.

If you need to roll back manually on the VPS, export the same environment variables used by the deploy workflow before invoking `./scripts/deploy.sh prod <image_tag>`.

### Database Rollback

Only for safe, reversible migrations:

```bash
ssh deploy@<prod-ip>
docker run --rm --network gitfable-prod_gitfable-network \
  -v /home/deploy/gitfable/backend/sql/migrations:/migrations \
  migrate/migrate \
  -path=/migrations \
  -database="$DATABASE_URL" \
  down 1
```

## Backups

- Daily `pg_dump` at 3 AM via cron
- Stored in `/home/deploy/gitfable/backups/`
- Retention: 7 daily + 4 weekly
- Script: `scripts/backup-db.sh`

### Restore from Backup

```bash
ssh deploy@<prod-ip>
gunzip -c backups/daily/gitfable_prod_20260311.sql.gz | \
  docker exec -i gitfable-postgres-prod psql -U <user> gitfable_prod
```

## Monitoring

- **UptimeRobot**: Pings `/health` every 5 min, email alerts on downtime
- **Docker health checks**: Auto-restart unhealthy containers
- **Logs**: `make vps-prod-logs` or `docker compose -f docker/docker-compose.vps-prod.yml logs -f` on VPS

## Server Access

```bash
ssh deploy@<dev-ip>    # Dev VPS
ssh deploy@<prod-ip>   # Prod VPS
```

App directory: `/home/deploy/gitfable/`

## Provisioning New Server

Run `scripts/provision.sh` on a fresh Ubuntu 24.04 VPS. See script for details.
