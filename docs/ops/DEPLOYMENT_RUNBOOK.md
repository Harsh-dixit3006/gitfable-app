# GitFable Deployment Runbook (Dev + Prod)

This runbook defines a robust two-environment deployment model for GitFable:

- **Dev**: rapid iteration and integration testing
- **Prod**: controlled release with manual approvals and rollback readiness

Stack:

- **Backend API**: Railway
- **Redis**: Railway Redis
- **Database + Auth**: Supabase
- **Frontend**: Cloudflare Pages

---

## 1) Environment Topology

### Dev Environment

- Supabase project: `gitfable-dev`
- Railway services:
  - `gitfable-api-dev`
  - `gitfable-redis-dev`
- Cloudflare Pages project: `gitfable-dev`
- Git branch: `develop`

### Prod Environment

- Supabase project: `gitfable-prod`
- Railway services:
  - `gitfable-api-prod`
  - `gitfable-redis-prod`
- Cloudflare Pages project: `gitfable`
- Custom domain: `gitfable.app`
- Git branch: `main`

---

## 2) Source Control and Promotion Model

- Feature branches -> PR -> `develop`
- `develop` auto-deploys to Dev
- `main` deploy requires approval and deploys to Prod

Rules:

- No direct push to `main`
- Every deploy must come from versioned commit
- Production database migrations run only in production deploy workflow

---

## 3) Required Secrets and Variables

Use platform secret stores only (GitHub Secrets, Railway Variables, Cloudflare Secrets).

### Backend (Railway) - Dev

- `ENVIRONMENT=development`
- `PORT=8001`
- `DATABASE_URL` (Supabase dev URL with `sslmode=require`)
- `REDIS_URL` (Railway Redis dev URL)
- `DB_POOL_SIZE=10`
- `RATE_LIMIT_ENABLED=true`
- `SUPABASE_URL` (dev)
- `SUPABASE_SERVICE_ROLE_KEY` (dev)
- `CORS_ORIGINS` (dev frontend domain)
- `FRONTEND_URL` (dev frontend domain)
- `GITHUB_TOKEN`
- `GITHUB_WEBHOOK_SECRET`

### Backend (Railway) - Prod

- `ENVIRONMENT=production`
- `PORT=8001`
- `DATABASE_URL` (Supabase prod URL with `sslmode=require`)
- `REDIS_URL` (Railway Redis prod URL)
- `DB_POOL_SIZE=25`
- `RATE_LIMIT_ENABLED=true`
- `SUPABASE_URL` (prod)
- `SUPABASE_SERVICE_ROLE_KEY` (prod)
- `CORS_ORIGINS` (prod frontend domain)
- `FRONTEND_URL` (prod frontend domain)
- `GITHUB_TOKEN`
- `GITHUB_WEBHOOK_SECRET`

### Frontend (Cloudflare Pages) - Dev

- `REACT_APP_BACKEND_URL`
- `REACT_APP_SUPABASE_URL` (dev)
- `REACT_APP_SUPABASE_ANON_KEY` (dev)

### Frontend (Cloudflare Pages) - Prod

- `REACT_APP_BACKEND_URL`
- `REACT_APP_SUPABASE_URL` (prod)
- `REACT_APP_SUPABASE_ANON_KEY` (prod)

---

## 4) Supabase Configuration Per Environment

For both `gitfable-dev` and `gitfable-prod`:

1. Enable GitHub provider in Auth
2. Configure environment-specific callback URLs
3. Set Site URL and Redirect URLs

Dev URLs example:

- Site URL: `https://gitfable-dev.pages.dev`
- Redirect URL: `https://gitfable-dev.pages.dev`

Prod URLs example:

- Site URL: `https://gitfable.app`
- Redirect URL: `https://gitfable.app`

---

## 5) Migration Strategy

Migrations live in `backend/sql/migrations` and are executed with `golang-migrate`.

### Dev migration command

```bash
make migrate-up
make migrate-version
```

### Prod migration command (manual gate)

Run from CI job with prod `DATABASE_URL` loaded from secrets.

Rules:

- No manual dashboard schema edits in production
- All schema changes via migration files only
- Prefer forward-fix over rollback when possible

---

## 6) Deployment Steps - Dev

On merge to `develop`:

1. Run backend tests
2. Run frontend tests and build
3. Deploy backend to Railway Dev
4. Run dev DB migrations
5. Deploy frontend to Cloudflare Pages Dev
6. Smoke test:
   - `GET /health`
   - `GET /ready`
   - Optional auth smoke test

---

## 7) Deployment Steps - Prod

On merge to `main`:

1. Run test/build checks
2. Require manual approval for production environment
3. Deploy backend to Railway Prod
4. Run prod DB migrations
5. Deploy frontend to Cloudflare Pages Prod
6. Run smoke tests:
   - `GET /health`
   - `GET /ready`
   - Auth flow check

---

## 8) Rollback Plan

### Frontend rollback

- Roll back Cloudflare Pages to previous successful deployment

### Backend rollback

- Roll back Railway service to previous release

### Database rollback

- Use `migrate down 1` only for known-safe reversible migrations
- Prefer forward-fix migration for non-trivial production issues

---

## 9) Monitoring and Alerting

Minimum required:

- Uptime monitor on `/health` and `/ready`
- Error alerting for 5xx spike
- Railway logs enabled

Recommended:

- Sentry for frontend and backend
- Slack/Discord webhook for deploy failures

---

## 10) Security and Secret Rotation

- Never commit secrets to git
- Rotate these after setup and then quarterly:
  - Supabase DB password
  - Supabase service role key
  - Redis password
  - GitHub PAT/webhook secret

---

## 11) Internal Development Workflow

- Developers use local `.env` mapped to **dev** environment resources only
- No one uses production keys locally
- Production access restricted to release owners

---

## 12) Go-Live Readiness Checklist

- [ ] Dev and prod resources are separate
- [ ] All env vars configured in Railway and Cloudflare
- [ ] Supabase OAuth callbacks configured for both environments
- [ ] Production migration dry run verified in Dev
- [ ] Smoke tests pass in both environments
- [ ] Alerting configured
- [ ] Secrets rotated after final verification
