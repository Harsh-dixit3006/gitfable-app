# Secrets Setup

## GitHub Actions Secrets

### Required for both environments

| Secret | Description |
|--------|-------------|
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID for GitHub Actions |
| `TS_OAUTH_SECRET` | Tailscale OAuth client secret for GitHub Actions |
| `DEV_TAILSCALE_HOST` | Dev VPS Tailscale hostname (MagicDNS name or tailnet IP) |
| `PROD_TAILSCALE_HOST` | Prod VPS Tailscale hostname (MagicDNS name or tailnet IP) |

### Dev environment

| Secret | Description |
|--------|-------------|
| `DEV_REACT_APP_BACKEND_URL` | `https://dev.gitfable.app/api` |
| `DEV_REACT_APP_SUPABASE_URL` | Dev Supabase project URL |
| `DEV_REACT_APP_SUPABASE_ANON_KEY` | Dev Supabase anon key |
| `DEV_BACKEND_HEALTH_URL` | `https://dev.gitfable.app/health` |
| `DEV_BACKEND_READY_URL` | `https://dev.gitfable.app/ready` |

### Prod environment

| Secret | Description |
|--------|-------------|
| `PROD_REACT_APP_BACKEND_URL` | `https://gitfable.app/api` |
| `PROD_REACT_APP_SUPABASE_URL` | Prod Supabase project URL |
| `PROD_REACT_APP_SUPABASE_ANON_KEY` | Prod Supabase anon key |
| `PROD_BACKEND_HEALTH_URL` | `https://gitfable.app/health` |
| `PROD_BACKEND_READY_URL` | `https://gitfable.app/ready` |

### GitHub Production Environment

1. Go to repo Settings → Environments → New environment → `production`
2. Enable "Required reviewers" (add yourself)
3. Optionally set a wait timer (e.g., 5 minutes)

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

## Supabase Auth Configuration

### Dev project

- Site URL: `https://dev.gitfable.app`
- Redirect URLs: `https://dev.gitfable.app/**`
- GitHub OAuth provider enabled

### Prod project

- Site URL: `https://gitfable.app`
- Redirect URLs: `https://gitfable.app/**`
- GitHub OAuth provider enabled

## GHCR Access

GitHub Container Registry uses `GITHUB_TOKEN` automatically in workflows. No additional setup needed.

## Removed (no longer needed)

- ~~Railway tokens~~ — replaced by SSH deploy
- ~~Cloudflare API tokens~~ — replaced by self-hosted frontend
- ~~Railway service names~~ — replaced by VPS
- ~~Cloudflare project names~~ — replaced by VPS

## Secret Rotation

Recommended quarterly:
- Rotate VPS SSH keys
- Rotate Postgres and Redis passwords (update secret files + env files, restart services)
- Rotate GitHub PAT (`GITHUB_TOKEN` in env files)
- Rotate Supabase service role key
