# Deployment & Release Improvements Design

**Date:** 2026-03-23
**Status:** Approved
**Approach:** Incremental hardening — no new tools or services beyond self-hosted runners, Discord webhook, and B2 CLI

## Context

GitFable uses a 2-VPS (Hetzner CX22) deployment with GitHub Actions CI/CD, GHCR for container images, and Docker Compose per server. The current setup works but has gaps in versioning, reliability, observability, and deployment mechanics.

## Goals

1. Add semantic versioning with GitHub Releases and auto-generated changelogs
2. Prevent deploy races with concurrency locks
3. Expand smoke tests to verify actual API functionality
4. Add dev rollback workflow (parity with prod)
5. Add Discord deployment notifications
6. Add offsite database backups to Backblaze B2
7. Add migration warnings to rollback workflows
8. Replace Tailscale SSH with self-hosted GitHub Actions runners
9. Clean up dead files

## Non-Goals

- No changes to backend/frontend application code
- No changes to Docker Compose structure or Caddy config
- No changes to database schema or secret management on VPS
- No GitOps tooling (ArgoCD, Flux)
- No centralized logging/monitoring (Loki, Grafana)

---

## 1. Semantic Versioning & GitHub Releases

### Trigger

Push a git tag matching `v*` (e.g., `v1.0.0`).

### Workflow: `release.yml`

1. Triggered by `push: tags: ['v*']`
2. Runs test, build-and-push (same as `deploy-prod.yml`) — images tagged with both SHA and semver
3. Generates changelog from commits since the previous `v*` tag using `git log --pretty`
4. Groups commits by conventional commit type (feat, fix, chore, etc.)
5. Creates a GitHub Release with the tag name as title and changelog as body
6. Deploys to prod (same deploy job as `deploy-prod.yml`, on `[self-hosted, vps-prod]`)

### Deploy Integration

`release.yml` is a standalone workflow — it does NOT call `deploy-prod.yml` via `workflow_call`. This avoids the complexity of conditional test/build skipping and the double-trigger race.

Instead, the two workflows are independent:
- `deploy-prod.yml`: triggers on `push: branches: [main]` — standard SHA-tagged deploy
- `release.yml`: triggers on `push: tags: ['v*']` — full test → build (SHA + semver tags) → release → deploy

Since a tag push to `main` does NOT trigger `push: branches: [main]` (GitHub Actions evaluates tags and branches separately), there is no race condition.

**Trade-off:** Pushing a tag to a commit that was already deployed via a `main` push will re-run tests and re-build images. This is intentional — it keeps the release workflow self-contained and guarantees the released image matches the tagged commit exactly. The redundancy is ~3-5 minutes of CI time and only happens at release time.

### Release Process

1. Merge PRs to `main` — triggers `deploy-prod.yml` (SHA-tagged images only)
2. When ready to cut a release: `git tag v1.2.0 && git push origin v1.2.0`
3. `release.yml` fires: test → build (SHA + semver tags) → changelog → GitHub Release → deploy
4. Both SHA and semver-tagged images exist in GHCR

Dev flow is unchanged — auto-deploys on push to `devel` with no versioning.

---

## 2. Deploy Concurrency Locks

### Problem

Two rapid pushes to `main` or `devel` can trigger concurrent deploys that race on the VPS.

### Solution

Add `concurrency` groups to all deploy and rollback workflows:

```yaml
# deploy-prod.yml / rollback-prod.yml
concurrency:
  group: deploy-prod
  cancel-in-progress: false

# deploy-dev.yml / rollback-dev.yml
concurrency:
  group: deploy-dev
  cancel-in-progress: false
```

- `cancel-in-progress: false` queues the second run rather than canceling the first
- Prod and dev have separate groups (don't block each other)
- Rollback shares the group with its deploy counterpart

---

## 3. Expanded Smoke Tests

### Current State

Only `/health` and `/ready` are checked — confirms the process is up but not that the app works.

### Addition

After health/ready checks, add:

```bash
# Derive API base URL from existing health URL secret (e.g., https://gitfable.app/health -> https://gitfable.app)
API_BASE="${BACKEND_HEALTH_URL%/health}"
HTTP_STATUS=$(curl -s -o /tmp/smoke-response.json -w "%{http_code}" "${API_BASE}/api/v1/issues?limit=1")
if [ "$HTTP_STATUS" != "200" ]; then
  echo "API smoke test failed with status: $HTTP_STATUS"
  exit 1
fi
# Validate JSON envelope shape (not data content — DB may be empty)
jq -e 'has("data") and has("meta") and has("error")' /tmp/smoke-response.json
```

- The API URL is derived from the existing `*_BACKEND_HEALTH_URL` secrets (strip `/health` suffix) — no new secrets needed
- `GET /api/v1/issues` is public (no auth), exercises the router, middleware, database, and JSON serialization
- Validates HTTP 200 and that the response has the expected envelope keys (`data`, `meta`, `error`)
- Does NOT validate data content — the DB may be empty on a fresh deploy, which is valid
- Applied to all deploy and rollback workflows (prod and dev)

---

## 4. Dev Rollback Workflow

### File: `rollback-dev.yml`

Mirrors `rollback-prod.yml` with these differences:

- **No environment approval gate** (dev doesn't need manual approval)
- Uses `DEV_*` secrets and `vps-dev` runner label
- Trigger: `workflow_dispatch` with `image_tag`, `commit_sha`, and `reason` inputs
- `commit_sha` is used for migration warning check (see Section 7)
- Shares `deploy-dev` concurrency group
- Includes expanded smoke tests

---

## 5. Discord Deployment Notifications

### Reusable Workflow: `notify.yml`

Called by deploy and rollback workflows via `workflow_call`.

**Inputs:**
- `status` (success | failure | rollback)
- `environment` (prod | dev)
- `version` (image tag or semver)
- `message` (optional extra context)
- `run_url` (link to workflow run)

**Implementation:**

```bash
curl -H "Content-Type: application/json" \
  -d '{"embeds": [{"title": "...", "color": ..., "fields": [...]}]}' \
  "$DISCORD_WEBHOOK_URL"
```

**Colors:**
- Green (3066993) for success
- Red (15158332) for failure
- Orange (15105570) for rollback

**Secret:** `DISCORD_WEBHOOK_URL` — repository-level secret.

**When called:**
- Deploy succeeded → green notification
- Deploy failed → red notification (called via `if: failure()`)
- Rollback triggered → orange notification with target tag and reason

**Error handling:** All notification steps use `continue-on-error: true` so a missing or invalid webhook URL does not fail the calling workflow. This also handles forks where the secret may not be configured.

---

## 6. Offsite Backup to Backblaze B2

### Changes to `backup-db.sh`

After the existing local backup logic, add a B2 upload step:

```bash
# Upload to B2 (if configured)
if command -v b2 &>/dev/null && [ -n "$B2_BUCKET_NAME" ]; then
  b2 upload-file "$B2_BUCKET_NAME" "$backup_file" \
    "gitfable/${ENV}/daily/${filename}" || echo "WARN: B2 upload failed"
fi
```

- Upload path: `b2://bucket/gitfable/{prod|dev}/daily/YYYY-MM-DD.sql.gz`
- Weekly backups also uploaded to `.../weekly/`
- **Non-blocking:** If B2 upload fails, logs a warning but does not fail the backup
- Logs the file size for monitoring B2 free tier usage (10GB limit)

### B2 Credentials

Stored as environment variables on the VPS (in a sourced env file for the cron job):
- `B2_APPLICATION_KEY_ID`
- `B2_APPLICATION_KEY`
- `B2_BUCKET_NAME`

### B2 Lifecycle Rules

Set once in B2 console (not managed by the script):
- Daily prefix: 30-day retention
- Weekly prefix: 90-day retention

### Changes to `provision.sh`

Add B2 CLI installation (system-wide, not `--user`, since `backup-db.sh` runs as the `deploy` user):

```bash
pip3 install b2
```

---

## 7. Migration Warning in Rollbacks

### Problem

Rolling back app code after a deploy that included DB migrations may leave the app incompatible with the current schema.

### Solution: Warning, Not Automatic Rollback

Automatic `migrate-down` is dangerous (can drop columns/tables with data). Most migrations are additive and backwards-compatible.

**Implementation in rollback workflows:**

Rollback workflows accept a `commit_sha` input (the git SHA of the commit being rolled back to). This is needed because image tags like `prod-abc1234` cannot be used as git refs.

Rollback workflows use `actions/checkout@v4` with `fetch-depth: 0` (full clone) so the full git history is available for the diff.

```bash
# Check if migrations changed between rollback target and current HEAD
MIGRATION_DIFF=$(git diff --name-only "${{ inputs.commit_sha }}"..HEAD -- backend/sql/migrations/)
if [ -n "$MIGRATION_DIFF" ]; then
  echo "::warning::This rollback spans database migrations. Verify schema compatibility."
  echo "Changed migrations:"
  echo "$MIGRATION_DIFF"
fi
```

- Prominent GitHub Actions warning annotation
- Also included in the Discord rollback notification
- Does NOT auto-rollback migrations — that stays a manual decision

---

## 8. Self-hosted Runners Replacing Tailscale SSH

### Setup (one-time per VPS)

1. Download GitHub Actions runner on each VPS as `deploy` user
2. Register with labels:
   - Prod VPS: `self-hosted, vps-prod`
   - Dev VPS: `self-hosted, vps-dev`
3. Install as systemd service: `./svc.sh install && ./svc.sh start`
4. Runner has Docker access (deploy user already in docker group)
5. Auto-update is enabled by default — the runner self-updates when GitHub releases new versions

### Workflow Changes

**Before (current):**
```yaml
deploy:
  runs-on: ubuntu-latest
  steps:
    - uses: tailscale/github-action@v3
    - name: Preflight Tailscale SSH auth
      run: tailscale ssh deploy@${{ secrets.PROD_TAILSCALE_HOST }} "..."
    - name: Sync infrastructure files
      run: |
        tar czf /tmp/infra.tar.gz ...
        cat /tmp/infra.tar.gz | tailscale ssh deploy@... "tar xzf - -C ..."
    - name: Deploy via Tailscale SSH
      run: tailscale ssh deploy@... "export GHCR_TOKEN=...; ./deploy.sh prod ..."
```

**After:**
```yaml
deploy:
  runs-on: [self-hosted, vps-prod]
  permissions:
    packages: read
  steps:
    - uses: actions/checkout@v4
    - name: Deploy
      env:
        GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        GHCR_USERNAME: ${{ github.actor }}
      run: ./scripts/deploy.sh prod ${{ needs.build-and-push.outputs.image_tag }}
```

Note: `GHCR_TOKEN` and `GHCR_USERNAME` are still required by `deploy.sh` for GHCR login — the difference is they are now passed as native GitHub Actions secrets instead of piped through SSH string interpolation. The `permissions: packages: read` ensures the token has GHCR pull access on the self-hosted runner.

### What Gets Removed

- `tailscale/github-action@v3` from all workflows
- `TS_OAUTH_CLIENT_ID` and `TS_OAUTH_SECRET` GitHub secrets
- `DEV_TAILSCALE_HOST` and `PROD_TAILSCALE_HOST` GitHub secrets
- Preflight SSH auth steps
- Tar+pipe file sync steps
- Inline env var passing through SSH
- `tailscale-connectivity-check.yml` workflow (obsolete)

### What Stays

- `deploy.sh` core logic (pull images, compose up, health check, migrate)
- Smoke tests on `ubuntu-latest` (they hit public URLs, don't need VPS access)
- Build-and-push on `ubuntu-latest` (VPS shouldn't build images)
- Prod environment approval gate (runner-agnostic)

### `provision.sh` Changes

- Remove Tailscale installation section
- Add GitHub Actions runner download, configuration, and systemd service setup

### `deploy.sh` Simplification

- `GHCR_TOKEN` and `GHCR_USERNAME` env vars are still required — the change is how they arrive (native GitHub Actions secrets instead of SSH string interpolation)
- Remove any SSH-specific workarounds or assumptions about the execution environment
- The script's core logic (GHCR login, image pull, compose up, health check, migrate) is unchanged

---

## 9. Cleanup

### Delete

- `docker/docker-compose.prod.yml` — legacy pre-VPS file, unused
- `.github/workflows/tailscale-connectivity-check.yml` — obsolete with self-hosted runners

### Update

- Remove Makefile targets referencing `docker-compose.prod.yml` (lines 145, 148)
- Remove Tailscale-related entries from `bootstrap-github-secrets.sh` (remove `TS_OAUTH_CLIENT_ID`, `TS_OAUTH_SECRET`, `DEV_TAILSCALE_HOST`, `PROD_TAILSCALE_HOST` from `required_vars` and corresponding `gh secret set` calls)
- Add `DISCORD_WEBHOOK_URL` to `bootstrap-github-secrets.sh` as a repo-level secret

---

## Files Changed Summary

| File | Action |
|------|--------|
| `.github/workflows/deploy-prod.yml` | Rewrite deploy job, add concurrency, expanded smoke, notifications |
| `.github/workflows/deploy-dev.yml` | Rewrite deploy job, add concurrency, expanded smoke, notifications |
| `.github/workflows/rollback-prod.yml` | Rewrite deploy job, add concurrency, migration warning, expanded smoke, notifications |
| `.github/workflows/rollback-dev.yml` | **New** — mirrors rollback-prod without approval gate |
| `.github/workflows/release.yml` | **New** — tag-triggered: test, build (SHA+semver), changelog, GitHub Release, deploy |
| `.github/workflows/notify.yml` | **New** — reusable Discord notification workflow |
| `.github/workflows/tailscale-connectivity-check.yml` | **Delete** |
| `docker/docker-compose.prod.yml` | **Delete** |
| `scripts/deploy.sh` | Simplify (remove SSH-specific workarounds) |
| `scripts/provision.sh` | Replace Tailscale with runner setup, add B2 CLI |
| `scripts/backup-db.sh` | Add B2 upload step |
| `scripts/bootstrap-github-secrets.sh` | Remove Tailscale secrets, add Discord webhook |
| `Makefile` | Remove targets referencing legacy `docker-compose.prod.yml` |

## New Secrets

| Secret | Scope | Purpose |
|--------|-------|---------|
| `DISCORD_WEBHOOK_URL` | GitHub repo-level | Deploy notifications |
| `B2_APPLICATION_KEY_ID` | VPS env file | Offsite backup auth |
| `B2_APPLICATION_KEY` | VPS env file | Offsite backup auth |
| `B2_BUCKET_NAME` | VPS env file | Offsite backup target |

## Removed Secrets

| Secret | Reason |
|--------|--------|
| `TS_OAUTH_CLIENT_ID` | Tailscale removed |
| `TS_OAUTH_SECRET` | Tailscale removed |
| `DEV_TAILSCALE_HOST` | Tailscale removed |
| `PROD_TAILSCALE_HOST` | Tailscale removed |
