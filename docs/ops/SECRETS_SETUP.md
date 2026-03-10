# Secrets Setup Guide (GitHub + Railway + Cloudflare)

This is a click-by-click setup checklist for all deployment secrets.

---

## 1) GitHub: Repository Secrets

Path: `GitHub Repository -> Settings -> Secrets and variables -> Actions`

### Shared Secrets

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

### Dev Secrets

- `RAILWAY_DEV_TOKEN`
- `RAILWAY_DEV_SERVICE_NAME`
- `DEV_DATABASE_URL`
- `DEV_REACT_APP_BACKEND_URL`
- `DEV_REACT_APP_SUPABASE_URL`
- `DEV_REACT_APP_SUPABASE_ANON_KEY`
- `DEV_BACKEND_HEALTH_URL`
- `DEV_BACKEND_READY_URL`
- `CLOUDFLARE_DEV_PROJECT_NAME`

### Prod Secrets

- `RAILWAY_PROD_TOKEN`
- `RAILWAY_PROD_SERVICE_NAME`
- `PROD_DATABASE_URL`
- `PROD_REACT_APP_BACKEND_URL`
- `PROD_REACT_APP_SUPABASE_URL`
- `PROD_REACT_APP_SUPABASE_ANON_KEY`
- `PROD_BACKEND_HEALTH_URL`
- `PROD_BACKEND_READY_URL`
- `CLOUDFLARE_PROD_PROJECT_NAME`

---

## 2) GitHub: Production Environment Gate

Path: `GitHub Repository -> Settings -> Environments -> New environment`

Create environment named `production` and configure:

- Required reviewers: at least 1
- Prevent self-review: enabled
- Optional wait timer: 5 minutes

This gate is used by `deploy-prod.yml` and `rollback-prod.yml`.

---

## 3) Railway: Backend Variables

Path: `Railway Project -> Service -> Variables`

### Dev backend service (`gitfable-api-dev`)

- `ENVIRONMENT=development`
- `PORT=8001`
- `DATABASE_URL=<supabase-dev-db-url>`
- `REDIS_URL=<railway-dev-redis-url>`
- `DB_POOL_SIZE=10`
- `RATE_LIMIT_ENABLED=true`
- `SUPABASE_URL=<supabase-dev-url>`
- `SUPABASE_SERVICE_ROLE_KEY=<supabase-dev-service-role-key>`
- `CORS_ORIGINS=<dev-frontend-url>`
- `FRONTEND_URL=<dev-frontend-url>`
- `GITHUB_TOKEN=<github-pat>`
- `GITHUB_WEBHOOK_SECRET=<webhook-secret>`

### Prod backend service (`gitfable-api-prod`)

- `ENVIRONMENT=production`
- `PORT=8001`
- `DATABASE_URL=<supabase-prod-db-url>`
- `REDIS_URL=<railway-prod-redis-url>`
- `DB_POOL_SIZE=25`
- `RATE_LIMIT_ENABLED=true`
- `SUPABASE_URL=<supabase-prod-url>`
- `SUPABASE_SERVICE_ROLE_KEY=<supabase-prod-service-role-key>`
- `CORS_ORIGINS=<prod-frontend-url>`
- `FRONTEND_URL=<prod-frontend-url>`
- `GITHUB_TOKEN=<github-pat>`
- `GITHUB_WEBHOOK_SECRET=<webhook-secret>`

---

## 4) Cloudflare Pages: Project Variables

Path: `Cloudflare Dashboard -> Workers & Pages -> <Project> -> Settings -> Environment variables`

### Dev Pages project

- `REACT_APP_BACKEND_URL=<dev-backend-url>`
- `REACT_APP_SUPABASE_URL=<supabase-dev-url>`
- `REACT_APP_SUPABASE_ANON_KEY=<supabase-dev-anon-key>`

### Prod Pages project

- `REACT_APP_BACKEND_URL=<prod-backend-url>`
- `REACT_APP_SUPABASE_URL=<supabase-prod-url>`
- `REACT_APP_SUPABASE_ANON_KEY=<supabase-prod-anon-key>`

---

## 5) Supabase: Auth Redirect URLs

Path: `Supabase Dashboard -> Authentication -> URL Configuration`

### Dev project

- Site URL: dev frontend URL
- Redirect URLs: include dev frontend URL

### Prod project

- Site URL: prod frontend URL
- Redirect URLs: include prod frontend URL

Also configure GitHub provider in both projects.

---

## 6) Final Validation

1. Push to `develop` and confirm Dev workflow green
2. Validate Dev `/health` and `/ready`
3. Merge to `main`, approve production environment gate
4. Validate Prod `/health` and `/ready`

---

## 7) Bulk Secret Upload (Recommended)

Instead of creating secrets one by one:

1. Copy template:

```bash
mkdir -p .secrets
cp docs/ops/all.env.example .secrets/all.env
```

2. Fill `.secrets/all.env` values.

3. Run bootstrap script:

```bash
chmod +x scripts/bootstrap-github-secrets.sh
./scripts/bootstrap-github-secrets.sh .secrets/all.env
```

This uploads all required GitHub Actions secrets for Dev and Prod.
