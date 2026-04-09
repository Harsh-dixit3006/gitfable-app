# Secrets Setup

## GitHub Actions Secrets

### Shared secrets

| Secret | Description |
|--------|-------------|
| `APP_GITHUB_TOKEN` | GitHub token used by the backend issue sync and live GitHub API calls |
| `GITHUB_WEBHOOK_SECRET` | Shared webhook secret for `/api/v1/webhooks/github` |
| `DISCORD_WEBHOOK_URL` | Optional Discord webhook for deployment notifications |

### Dev environment

| Secret | Description |
|--------|-------------|
| `DEV_REACT_APP_BACKEND_URL` | `https://dev.gitfable.app` |
| `DEV_BACKEND_HEALTH_URL` | `https://dev.gitfable.app/health` |
| `DEV_BACKEND_READY_URL` | `https://dev.gitfable.app/ready` |
| `DEV_POSTGRES_USER` | PostgreSQL username written into the VPS Docker secret |
| `DEV_POSTGRES_PASSWORD` | PostgreSQL password written into the VPS Docker secret |
| `DEV_REDIS_PASSWORD` | Redis password written into the VPS Docker secret |
| `DEV_GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth app client ID for dev |
| `DEV_GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth app client secret for dev |
| `DEV_JWT_SECRET` | JWT signing secret for dev |

### Prod environment

| Secret | Description |
|--------|-------------|
| `PROD_REACT_APP_BACKEND_URL` | `https://gitfable.app` |
| `PROD_BACKEND_HEALTH_URL` | `https://gitfable.app/health` |
| `PROD_BACKEND_READY_URL` | `https://gitfable.app/ready` |
| `PROD_POSTGRES_USER` | PostgreSQL username written into the VPS Docker secret |
| `PROD_POSTGRES_PASSWORD` | PostgreSQL password written into the VPS Docker secret |
| `PROD_REDIS_PASSWORD` | Redis password written into the VPS Docker secret |
| `PROD_GITHUB_OAUTH_CLIENT_ID` | GitHub OAuth app client ID for prod |
| `PROD_GITHUB_OAUTH_CLIENT_SECRET` | GitHub OAuth app client secret for prod |
| `PROD_JWT_SECRET` | JWT signing secret for prod |

## GitHub Production Environment

1. Go to repo Settings → Environments → New environment → `production`
2. Enable required reviewers for production deploys
3. Optionally add a wait timer before production deployment

## VPS Secrets (on each server)

### Docker secrets (in `/home/deploy/gitfable/docker/secrets/`)

```bash
cd /home/deploy/gitfable/docker
# Create secret files
echo "gitfable" > secrets/postgres_user.txt
echo "<strong-password>" > secrets/postgres_password.txt
echo "<strong-password>" > secrets/redis_password.txt
chmod 600 secrets/*.txt
```

### Environment file

Copy and fill in the template (from `/home/deploy/gitfable/docker/`):

```bash
cd /home/deploy/gitfable/docker

# Dev VPS
cp .env.vps-dev.example .env.vps-dev
# Edit with actual values

# Prod VPS
cp .env.vps-prod.example .env.vps-prod
# Edit with actual values
```

**Important:** Update `DATABASE_URL` and `REDIS_URL` with actual passwords from the secret files.

## GitHub OAuth App Configuration

Create separate GitHub OAuth apps for dev and prod, or one app with both callback URLs.

- Dev callback: `https://dev.gitfable.app/api/v1/oauth/github/callback`
- Prod callback: `https://gitfable.app/api/v1/oauth/github/callback`

## GHCR Access

GitHub Container Registry uses `GITHUB_TOKEN` automatically in workflows. No additional setup needed.

## Secret Rotation

Recommended quarterly:
- Rotate VPS SSH keys
- Rotate Postgres and Redis passwords (update secret files + env files, restart services)
- Rotate GitHub PAT (`GITHUB_TOKEN` in env files)
- Rotate GitHub OAuth client secrets
- Rotate JWT signing secrets
