# Deployment & Release Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden deployments with versioning, concurrency locks, better smoke tests, notifications, offsite backups, self-hosted runners, and cleanup.

**Architecture:** Incremental changes to existing GitHub Actions workflows and shell scripts. No new services except self-hosted runners on VPS, Discord webhook, and B2 CLI. All changes are CI/CD and ops — no application code changes.

**Tech Stack:** GitHub Actions, Docker, Bash, Discord webhooks, Backblaze B2 CLI

**Spec:** `docs/superpowers/specs/2026-03-23-deployment-improvements-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `.github/workflows/notify.yml` | Create | Reusable Discord notification workflow |
| `.github/workflows/release.yml` | Create | Tag-triggered: test, build, changelog, GitHub Release, deploy |
| `.github/workflows/rollback-dev.yml` | Create | Dev rollback (mirrors prod without approval gate) |
| `.github/workflows/deploy-prod.yml` | Modify | Self-hosted runner, concurrency, expanded smoke, notifications |
| `.github/workflows/deploy-dev.yml` | Modify | Self-hosted runner, concurrency, expanded smoke, notifications |
| `.github/workflows/rollback-prod.yml` | Modify | Self-hosted runner, concurrency, migration warning, expanded smoke, notifications |
| `.github/workflows/tailscale-connectivity-check.yml` | Delete | Obsolete with self-hosted runners |
| `docker/docker-compose.prod.yml` | Delete | Legacy pre-VPS file, unused |
| `scripts/deploy.sh` | Modify | Update comment, remove SSH-specific assumptions |
| `scripts/backup-db.sh` | Modify | Add B2 upload step |
| `scripts/provision.sh` | Modify | Replace Tailscale with runner setup, add B2 CLI |
| `scripts/bootstrap-github-secrets.sh` | Modify | Remove Tailscale secrets, add Discord webhook |
| `Makefile` | Modify | Remove legacy docker-compose.prod targets |

---

### Task 1: Create Reusable Discord Notification Workflow

This is a dependency for all other workflows, so build it first.

**Files:**
- Create: `.github/workflows/notify.yml`

- [ ] **Step 1: Create `notify.yml`**

```yaml
name: Notify

on:
  workflow_call:
    inputs:
      status:
        description: 'Deployment status'
        required: true
        type: string  # success | failure | rollback
      environment:
        description: 'Target environment'
        required: true
        type: string  # prod | dev
      version:
        description: 'Image tag or semver'
        required: true
        type: string
      message:
        description: 'Optional extra context'
        required: false
        type: string
        default: ''
    secrets:
      DISCORD_WEBHOOK_URL:
        required: false

jobs:
  notify:
    name: Send Notification
    runs-on: ubuntu-latest
    steps:
      - name: Send Discord notification
        continue-on-error: true
        env:
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
        run: |
          if [ -z "$DISCORD_WEBHOOK_URL" ]; then
            echo "DISCORD_WEBHOOK_URL not set, skipping notification"
            exit 0
          fi

          STATUS="${{ inputs.status }}"
          ENV="${{ inputs.environment }}"
          VERSION="${{ inputs.version }}"
          MESSAGE="${{ inputs.message }}"
          RUN_URL="${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"

          case "$STATUS" in
            success) COLOR=3066993;  TITLE="Deploy Succeeded" ;;
            failure) COLOR=15158332; TITLE="Deploy Failed" ;;
            rollback) COLOR=15105570; TITLE="Rollback Triggered" ;;
            *) COLOR=8421504; TITLE="Deploy Update" ;;
          esac

          EMOJI=""
          case "$STATUS" in
            success) EMOJI="white_check_mark" ;;
            failure) EMOJI="x" ;;
            rollback) EMOJI="warning" ;;
          esac

          FIELDS="[{\"name\":\"Environment\",\"value\":\"${ENV}\",\"inline\":true},{\"name\":\"Version\",\"value\":\"\`${VERSION}\`\",\"inline\":true},{\"name\":\"Workflow\",\"value\":\"[View Run](${RUN_URL})\",\"inline\":true}"

          if [ -n "$MESSAGE" ]; then
            FIELDS="${FIELDS},{\"name\":\"Details\",\"value\":\"${MESSAGE}\",\"inline\":false}"
          fi

          FIELDS="${FIELDS}]"

          curl -sf -H "Content-Type: application/json" \
            -d "{\"embeds\":[{\"title\":\":${EMOJI}: ${TITLE}\",\"color\":${COLOR},\"fields\":${FIELDS},\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}]}" \
            "$DISCORD_WEBHOOK_URL" || echo "Discord notification failed (non-fatal)"
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/notify.yml'))"`
Expected: No output (valid YAML)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/notify.yml
git commit -m "feat: add reusable Discord notification workflow"
```

---

### Task 2: Cleanup Dead Files

Remove legacy files before modifying workflows to avoid confusion.

**Files:**
- Delete: `docker/docker-compose.prod.yml`
- Delete: `.github/workflows/tailscale-connectivity-check.yml`
- Modify: `Makefile` (lines 144-148)

- [ ] **Step 1: Delete legacy docker-compose.prod.yml**

```bash
rm docker/docker-compose.prod.yml
```

- [ ] **Step 2: Delete tailscale-connectivity-check.yml**

```bash
rm .github/workflows/tailscale-connectivity-check.yml
```

- [ ] **Step 3: Remove Makefile targets referencing docker-compose.prod.yml**

In `Makefile`, remove these lines (around lines 144-148):
```makefile
docker-prod-build: ## Build production images
	docker compose -f docker/docker-compose.prod.yml build

docker-prod-up: ## Start production services
	docker compose -f docker/docker-compose.prod.yml up -d
```

- [ ] **Step 4: Commit**

```bash
git add -A docker/docker-compose.prod.yml .github/workflows/tailscale-connectivity-check.yml Makefile
git commit -m "chore: remove legacy docker-compose.prod.yml and tailscale connectivity check"
```

---

### Task 3: Rewrite `deploy-dev.yml` (Self-hosted Runner + Concurrency + Smoke + Notifications)

**Files:**
- Modify: `.github/workflows/deploy-dev.yml`

- [ ] **Step 1: Rewrite `deploy-dev.yml`**

Replace the entire file with:

```yaml
name: Deploy Dev

on:
  push:
    branches: [devel]

concurrency:
  group: deploy-dev
  cancel-in-progress: false

env:
  BACKEND_IMAGE: ghcr.io/nishantg96/gitfable-backend
  FRONTEND_IMAGE: ghcr.io/nishantg96/gitfable-frontend

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version-file: backend/go.mod

      - name: Run backend tests
        working-directory: backend
        run: go test ./... -v

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend deps
        working-directory: frontend
        run: npm ci

      - name: Run frontend tests
        working-directory: frontend
        run: npm test -- --watchAll=false

      - name: Run frontend lint (via build)
        working-directory: frontend
        run: CI=true npm run build

  build-and-push:
    name: Build & Push Images
    runs-on: ubuntu-latest
    needs: test
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: ${{ steps.tag.outputs.TAG }}
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set image tag
        id: tag
        run: |
          TAG="dev-$(echo ${{ github.sha }} | cut -c1-7)"
          echo "TAG=$TAG" >> $GITHUB_OUTPUT
          echo "TAG=$TAG" >> $GITHUB_ENV

      - name: Build & push backend
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: |
            ${{ env.BACKEND_IMAGE }}:${{ env.TAG }}
            ${{ env.BACKEND_IMAGE }}:latest-dev

      - name: Build & push frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          build-args: |
            REACT_APP_BACKEND_URL=${{ secrets.DEV_REACT_APP_BACKEND_URL }}
            REACT_APP_SUPABASE_URL=${{ secrets.DEV_REACT_APP_SUPABASE_URL }}
            REACT_APP_SUPABASE_ANON_KEY=${{ secrets.DEV_REACT_APP_SUPABASE_ANON_KEY }}
          tags: |
            ${{ env.FRONTEND_IMAGE }}:${{ env.TAG }}
            ${{ env.FRONTEND_IMAGE }}:latest-dev

  deploy:
    name: Deploy to Dev VPS
    runs-on: [self-hosted, vps-dev]
    needs: build-and-push
    permissions:
      packages: read
    steps:
      - uses: actions/checkout@v4

      - name: Deploy
        env:
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GHCR_USERNAME: ${{ github.actor }}
        run: ./scripts/deploy.sh dev ${{ needs.build-and-push.outputs.image_tag }}

  smoke-test:
    name: Smoke Test
    runs-on: ubuntu-latest
    needs: deploy
    steps:
      - name: Wait for deployment to settle
        run: sleep 10

      - name: Check health endpoint
        run: |
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.DEV_BACKEND_HEALTH_URL }}")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Health check failed with status: $HTTP_STATUS"
            exit 1
          fi
          echo "Health check passed"

      - name: Check ready endpoint
        run: |
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.DEV_BACKEND_READY_URL }}")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Ready check failed with status: $HTTP_STATUS"
            exit 1
          fi
          echo "Ready check passed"

      - name: Smoke test API endpoint
        run: |
          API_BASE="${{ secrets.DEV_BACKEND_HEALTH_URL }}"
          API_BASE="${API_BASE%/health}"
          HTTP_STATUS=$(curl -s -o /tmp/smoke-response.json -w "%{http_code}" "${API_BASE}/api/v1/issues?limit=1")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "API smoke test failed with status: $HTTP_STATUS"
            cat /tmp/smoke-response.json 2>/dev/null || true
            exit 1
          fi
          jq -e 'has("data") and has("meta") and has("error")' /tmp/smoke-response.json
          echo "API smoke test passed"

  notify-success:
    name: Notify Success
    needs: [build-and-push, smoke-test]
    if: success()
    uses: ./.github/workflows/notify.yml
    with:
      status: success
      environment: dev
      version: ${{ needs.build-and-push.outputs.image_tag }}
    secrets:
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}

  notify-failure:
    name: Notify Failure
    needs: [build-and-push, deploy, smoke-test]
    if: failure()
    uses: ./.github/workflows/notify.yml
    with:
      status: failure
      environment: dev
      version: ${{ needs.build-and-push.outputs.image_tag || 'unknown' }}
    secrets:
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-dev.yml'))"`
Expected: No output (valid YAML)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-dev.yml
git commit -m "feat: rewrite deploy-dev with self-hosted runner, concurrency, expanded smoke tests, notifications"
```

---

### Task 4: Rewrite `deploy-prod.yml` (Self-hosted Runner + Concurrency + Smoke + Notifications)

**Files:**
- Modify: `.github/workflows/deploy-prod.yml`

- [ ] **Step 1: Rewrite `deploy-prod.yml`**

Replace the entire file. Identical to deploy-dev except: triggers on `main`, uses `vps-prod` runner, `PROD_*` secrets, `production` environment gate.

```yaml
name: Deploy Prod

on:
  push:
    branches: [main]

concurrency:
  group: deploy-prod
  cancel-in-progress: false

env:
  BACKEND_IMAGE: ghcr.io/nishantg96/gitfable-backend
  FRONTEND_IMAGE: ghcr.io/nishantg96/gitfable-frontend

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version-file: backend/go.mod

      - name: Run backend tests
        working-directory: backend
        run: go test ./... -v

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend deps
        working-directory: frontend
        run: npm ci

      - name: Run frontend tests
        working-directory: frontend
        run: npm test -- --watchAll=false

      - name: Run frontend lint (via build)
        working-directory: frontend
        run: CI=true npm run build

  build-and-push:
    name: Build & Push Images
    runs-on: ubuntu-latest
    needs: test
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: ${{ steps.tag.outputs.TAG }}
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set image tag
        id: tag
        run: |
          TAG="prod-$(echo ${{ github.sha }} | cut -c1-7)"
          echo "TAG=$TAG" >> $GITHUB_OUTPUT
          echo "TAG=$TAG" >> $GITHUB_ENV

      - name: Build & push backend
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: |
            ${{ env.BACKEND_IMAGE }}:${{ env.TAG }}
            ${{ env.BACKEND_IMAGE }}:latest-prod

      - name: Build & push frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          build-args: |
            REACT_APP_BACKEND_URL=${{ secrets.PROD_REACT_APP_BACKEND_URL }}
            REACT_APP_SUPABASE_URL=${{ secrets.PROD_REACT_APP_SUPABASE_URL }}
            REACT_APP_SUPABASE_ANON_KEY=${{ secrets.PROD_REACT_APP_SUPABASE_ANON_KEY }}
          tags: |
            ${{ env.FRONTEND_IMAGE }}:${{ env.TAG }}
            ${{ env.FRONTEND_IMAGE }}:latest-prod

  deploy:
    name: Deploy to Prod VPS
    runs-on: [self-hosted, vps-prod]
    needs: build-and-push
    environment: production
    permissions:
      packages: read
    steps:
      - uses: actions/checkout@v4

      - name: Deploy
        env:
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GHCR_USERNAME: ${{ github.actor }}
        run: ./scripts/deploy.sh prod ${{ needs.build-and-push.outputs.image_tag }}

  smoke-test:
    name: Smoke Test
    runs-on: ubuntu-latest
    needs: deploy
    steps:
      - name: Wait for deployment to settle
        run: sleep 10

      - name: Check health endpoint
        run: |
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.PROD_BACKEND_HEALTH_URL }}")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Health check failed with status: $HTTP_STATUS"
            exit 1
          fi
          echo "Health check passed"

      - name: Check ready endpoint
        run: |
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.PROD_BACKEND_READY_URL }}")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Ready check failed with status: $HTTP_STATUS"
            exit 1
          fi
          echo "Ready check passed"

      - name: Smoke test API endpoint
        run: |
          API_BASE="${{ secrets.PROD_BACKEND_HEALTH_URL }}"
          API_BASE="${API_BASE%/health}"
          HTTP_STATUS=$(curl -s -o /tmp/smoke-response.json -w "%{http_code}" "${API_BASE}/api/v1/issues?limit=1")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "API smoke test failed with status: $HTTP_STATUS"
            cat /tmp/smoke-response.json 2>/dev/null || true
            exit 1
          fi
          jq -e 'has("data") and has("meta") and has("error")' /tmp/smoke-response.json
          echo "API smoke test passed"

  notify-success:
    name: Notify Success
    needs: [build-and-push, smoke-test]
    if: success()
    uses: ./.github/workflows/notify.yml
    with:
      status: success
      environment: prod
      version: ${{ needs.build-and-push.outputs.image_tag }}
    secrets:
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}

  notify-failure:
    name: Notify Failure
    needs: [build-and-push, deploy, smoke-test]
    if: failure()
    uses: ./.github/workflows/notify.yml
    with:
      status: failure
      environment: prod
      version: ${{ needs.build-and-push.outputs.image_tag || 'unknown' }}
    secrets:
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-prod.yml'))"`
Expected: No output (valid YAML)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-prod.yml
git commit -m "feat: rewrite deploy-prod with self-hosted runner, concurrency, expanded smoke tests, notifications"
```

---

### Task 5: Rewrite `rollback-prod.yml` (Self-hosted Runner + Migration Warning + Smoke + Notifications)

**Files:**
- Modify: `.github/workflows/rollback-prod.yml`

- [ ] **Step 1: Rewrite `rollback-prod.yml`**

Replace entire file:

```yaml
name: Rollback Prod

on:
  workflow_dispatch:
    inputs:
      image_tag:
        description: "Image tag to roll back to (e.g., prod-abc1234)"
        required: true
        type: string
      commit_sha:
        description: "Git commit SHA of the rollback target (for migration check)"
        required: true
        type: string
      reason:
        description: "Reason for rollback"
        required: true
        type: string

concurrency:
  group: deploy-prod
  cancel-in-progress: false

jobs:
  rollback:
    name: Rollback Production
    runs-on: [self-hosted, vps-prod]
    environment: production
    permissions:
      packages: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Confirm rollback
        run: |
          echo "Rolling back to: ${{ inputs.image_tag }}"
          echo "Commit SHA: ${{ inputs.commit_sha }}"
          echo "Reason: ${{ inputs.reason }}"

      - name: Check for migration changes
        id: migration-check
        run: |
          MIGRATION_DIFF=$(git diff --name-only "${{ inputs.commit_sha }}"..HEAD -- backend/sql/migrations/ 2>/dev/null || echo "")
          if [ -n "$MIGRATION_DIFF" ]; then
            echo "::warning::This rollback spans database migrations. Verify schema compatibility before proceeding."
            echo "Changed migration files:"
            echo "$MIGRATION_DIFF"
            echo "has_migrations=true" >> $GITHUB_OUTPUT
            echo "migration_files<<EOF" >> $GITHUB_OUTPUT
            echo "$MIGRATION_DIFF" >> $GITHUB_OUTPUT
            echo "EOF" >> $GITHUB_OUTPUT
          else
            echo "No migration changes between rollback target and HEAD"
            echo "has_migrations=false" >> $GITHUB_OUTPUT
          fi

      - name: Deploy rollback
        env:
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GHCR_USERNAME: ${{ github.actor }}
        run: ./scripts/deploy.sh prod ${{ inputs.image_tag }}

  smoke-test:
    name: Smoke Test After Rollback
    runs-on: ubuntu-latest
    needs: rollback
    steps:
      - name: Wait for rollback to settle
        run: sleep 10

      - name: Check health endpoint
        run: |
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.PROD_BACKEND_HEALTH_URL }}")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Health check FAILED after rollback!"
            exit 1
          fi
          echo "Health check passed after rollback"

      - name: Check ready endpoint
        run: |
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.PROD_BACKEND_READY_URL }}")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Ready check FAILED after rollback!"
            exit 1
          fi
          echo "Ready check passed after rollback"

      - name: Smoke test API endpoint
        run: |
          API_BASE="${{ secrets.PROD_BACKEND_HEALTH_URL }}"
          API_BASE="${API_BASE%/health}"
          HTTP_STATUS=$(curl -s -o /tmp/smoke-response.json -w "%{http_code}" "${API_BASE}/api/v1/issues?limit=1")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "API smoke test FAILED after rollback!"
            cat /tmp/smoke-response.json 2>/dev/null || true
            exit 1
          fi
          jq -e 'has("data") and has("meta") and has("error")' /tmp/smoke-response.json
          echo "API smoke test passed after rollback"

  notify:
    name: Notify Rollback
    needs: [rollback, smoke-test]
    if: always()
    uses: ./.github/workflows/notify.yml
    with:
      status: ${{ needs.smoke-test.result == 'success' && 'rollback' || 'failure' }}
      environment: prod
      version: ${{ inputs.image_tag }}
      message: "Reason: ${{ inputs.reason }}"
    secrets:
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/rollback-prod.yml'))"`
Expected: No output (valid YAML)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/rollback-prod.yml
git commit -m "feat: rewrite rollback-prod with self-hosted runner, migration warning, expanded smoke, notifications"
```

---

### Task 6: Create `rollback-dev.yml`

**Files:**
- Create: `.github/workflows/rollback-dev.yml`

- [ ] **Step 1: Create `rollback-dev.yml`**

Mirrors rollback-prod but: no `environment: production` gate, uses `vps-dev` runner, `DEV_*` secrets.

```yaml
name: Rollback Dev

on:
  workflow_dispatch:
    inputs:
      image_tag:
        description: "Image tag to roll back to (e.g., dev-abc1234)"
        required: true
        type: string
      commit_sha:
        description: "Git commit SHA of the rollback target (for migration check)"
        required: true
        type: string
      reason:
        description: "Reason for rollback"
        required: true
        type: string

concurrency:
  group: deploy-dev
  cancel-in-progress: false

jobs:
  rollback:
    name: Rollback Dev
    runs-on: [self-hosted, vps-dev]
    permissions:
      packages: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Confirm rollback
        run: |
          echo "Rolling back to: ${{ inputs.image_tag }}"
          echo "Commit SHA: ${{ inputs.commit_sha }}"
          echo "Reason: ${{ inputs.reason }}"

      - name: Check for migration changes
        id: migration-check
        run: |
          MIGRATION_DIFF=$(git diff --name-only "${{ inputs.commit_sha }}"..HEAD -- backend/sql/migrations/ 2>/dev/null || echo "")
          if [ -n "$MIGRATION_DIFF" ]; then
            echo "::warning::This rollback spans database migrations. Verify schema compatibility before proceeding."
            echo "Changed migration files:"
            echo "$MIGRATION_DIFF"
            echo "has_migrations=true" >> $GITHUB_OUTPUT
            echo "migration_files<<EOF" >> $GITHUB_OUTPUT
            echo "$MIGRATION_DIFF" >> $GITHUB_OUTPUT
            echo "EOF" >> $GITHUB_OUTPUT
          else
            echo "No migration changes between rollback target and HEAD"
            echo "has_migrations=false" >> $GITHUB_OUTPUT
          fi

      - name: Deploy rollback
        env:
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GHCR_USERNAME: ${{ github.actor }}
        run: ./scripts/deploy.sh dev ${{ inputs.image_tag }}

  smoke-test:
    name: Smoke Test After Rollback
    runs-on: ubuntu-latest
    needs: rollback
    steps:
      - name: Wait for rollback to settle
        run: sleep 10

      - name: Check health endpoint
        run: |
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.DEV_BACKEND_HEALTH_URL }}")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Health check FAILED after rollback!"
            exit 1
          fi
          echo "Health check passed after rollback"

      - name: Check ready endpoint
        run: |
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.DEV_BACKEND_READY_URL }}")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Ready check FAILED after rollback!"
            exit 1
          fi
          echo "Ready check passed after rollback"

      - name: Smoke test API endpoint
        run: |
          API_BASE="${{ secrets.DEV_BACKEND_HEALTH_URL }}"
          API_BASE="${API_BASE%/health}"
          HTTP_STATUS=$(curl -s -o /tmp/smoke-response.json -w "%{http_code}" "${API_BASE}/api/v1/issues?limit=1")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "API smoke test FAILED after rollback!"
            cat /tmp/smoke-response.json 2>/dev/null || true
            exit 1
          fi
          jq -e 'has("data") and has("meta") and has("error")' /tmp/smoke-response.json
          echo "API smoke test passed after rollback"

  notify:
    name: Notify Rollback
    needs: [rollback, smoke-test]
    if: always()
    uses: ./.github/workflows/notify.yml
    with:
      status: ${{ needs.smoke-test.result == 'success' && 'rollback' || 'failure' }}
      environment: dev
      version: ${{ inputs.image_tag }}
      message: "Reason: ${{ inputs.reason }}"
    secrets:
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/rollback-dev.yml'))"`
Expected: No output (valid YAML)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/rollback-dev.yml
git commit -m "feat: add dev rollback workflow with migration warning and notifications"
```

---

### Task 7: Create `release.yml` (Semantic Versioning + GitHub Releases)

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Create `release.yml`**

Standalone workflow: test → build (SHA + semver tags) → changelog → GitHub Release → deploy to prod.

```yaml
name: Release

on:
  push:
    tags: ['v*']

concurrency:
  group: deploy-prod
  cancel-in-progress: false

env:
  BACKEND_IMAGE: ghcr.io/nishantg96/gitfable-backend
  FRONTEND_IMAGE: ghcr.io/nishantg96/gitfable-frontend

jobs:
  test:
    name: Test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-go@v5
        with:
          go-version-file: backend/go.mod

      - name: Run backend tests
        working-directory: backend
        run: go test ./... -v

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: frontend/package-lock.json

      - name: Install frontend deps
        working-directory: frontend
        run: npm ci

      - name: Run frontend tests
        working-directory: frontend
        run: npm test -- --watchAll=false

      - name: Run frontend lint (via build)
        working-directory: frontend
        run: CI=true npm run build

  build-and-push:
    name: Build & Push Images
    runs-on: ubuntu-latest
    needs: test
    permissions:
      contents: read
      packages: write
    outputs:
      image_tag: ${{ steps.tag.outputs.TAG }}
      semver_tag: ${{ steps.tag.outputs.SEMVER }}
    steps:
      - uses: actions/checkout@v4

      - name: Log in to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set image tags
        id: tag
        run: |
          SHA_TAG="prod-$(echo ${{ github.sha }} | cut -c1-7)"
          SEMVER="${GITHUB_REF#refs/tags/}"
          echo "TAG=$SHA_TAG" >> $GITHUB_OUTPUT
          echo "TAG=$SHA_TAG" >> $GITHUB_ENV
          echo "SEMVER=$SEMVER" >> $GITHUB_OUTPUT
          echo "SEMVER=$SEMVER" >> $GITHUB_ENV

      - name: Build & push backend
        uses: docker/build-push-action@v5
        with:
          context: ./backend
          push: true
          tags: |
            ${{ env.BACKEND_IMAGE }}:${{ env.TAG }}
            ${{ env.BACKEND_IMAGE }}:${{ env.SEMVER }}
            ${{ env.BACKEND_IMAGE }}:latest-prod

      - name: Build & push frontend
        uses: docker/build-push-action@v5
        with:
          context: ./frontend
          push: true
          build-args: |
            REACT_APP_BACKEND_URL=${{ secrets.PROD_REACT_APP_BACKEND_URL }}
            REACT_APP_SUPABASE_URL=${{ secrets.PROD_REACT_APP_SUPABASE_URL }}
            REACT_APP_SUPABASE_ANON_KEY=${{ secrets.PROD_REACT_APP_SUPABASE_ANON_KEY }}
          tags: |
            ${{ env.FRONTEND_IMAGE }}:${{ env.TAG }}
            ${{ env.FRONTEND_IMAGE }}:${{ env.SEMVER }}
            ${{ env.FRONTEND_IMAGE }}:latest-prod

  release:
    name: Create GitHub Release
    runs-on: ubuntu-latest
    needs: build-and-push
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Generate changelog
        id: changelog
        run: |
          CURRENT_TAG="${GITHUB_REF#refs/tags/}"
          PREVIOUS_TAG=$(git tag --sort=-v:refname | grep '^v' | sed -n '2p' || echo "")

          if [ -z "$PREVIOUS_TAG" ]; then
            RANGE="HEAD"
          else
            RANGE="${PREVIOUS_TAG}..HEAD"
          fi

          {
            echo "CHANGELOG<<EOF"

            # Features
            FEATS=$(git log "$RANGE" --pretty=format:"%s" --grep="^feat" 2>/dev/null || true)
            if [ -n "$FEATS" ]; then
              echo "### Features"
              echo "$FEATS" | sed 's/^feat[^:]*: //' | sed 's/^/- /'
              echo ""
            fi

            # Fixes
            FIXES=$(git log "$RANGE" --pretty=format:"%s" --grep="^fix" 2>/dev/null || true)
            if [ -n "$FIXES" ]; then
              echo "### Fixes"
              echo "$FIXES" | sed 's/^fix[^:]*: //' | sed 's/^/- /'
              echo ""
            fi

            # Other changes
            OTHERS=$(git log "$RANGE" --pretty=format:"%s" --grep="^feat" --grep="^fix" --invert-grep 2>/dev/null || true)
            if [ -n "$OTHERS" ]; then
              echo "### Other Changes"
              echo "$OTHERS" | sed 's/^/- /'
              echo ""
            fi

            echo "**Full Changelog:** [\`${PREVIOUS_TAG:-initial}..${CURRENT_TAG}\`](https://github.com/${{ github.repository }}/compare/${PREVIOUS_TAG:-$(git rev-list --max-parents=0 HEAD | head -1)}...${CURRENT_TAG})"

            echo "EOF"
          } >> $GITHUB_OUTPUT

      - name: Create release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: |
          TAG="${GITHUB_REF#refs/tags/}"
          gh release create "$TAG" \
            --title "$TAG" \
            --notes "${{ steps.changelog.outputs.CHANGELOG }}"

  deploy:
    name: Deploy to Prod VPS
    runs-on: [self-hosted, vps-prod]
    needs: [build-and-push, release]
    environment: production
    permissions:
      packages: read
    steps:
      - uses: actions/checkout@v4

      - name: Deploy
        env:
          GHCR_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          GHCR_USERNAME: ${{ github.actor }}
        run: ./scripts/deploy.sh prod ${{ needs.build-and-push.outputs.image_tag }}

  smoke-test:
    name: Smoke Test
    runs-on: ubuntu-latest
    needs: deploy
    steps:
      - name: Wait for deployment to settle
        run: sleep 10

      - name: Check health endpoint
        run: |
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.PROD_BACKEND_HEALTH_URL }}")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Health check failed with status: $HTTP_STATUS"
            exit 1
          fi
          echo "Health check passed"

      - name: Check ready endpoint
        run: |
          HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${{ secrets.PROD_BACKEND_READY_URL }}")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "Ready check failed with status: $HTTP_STATUS"
            exit 1
          fi
          echo "Ready check passed"

      - name: Smoke test API endpoint
        run: |
          API_BASE="${{ secrets.PROD_BACKEND_HEALTH_URL }}"
          API_BASE="${API_BASE%/health}"
          HTTP_STATUS=$(curl -s -o /tmp/smoke-response.json -w "%{http_code}" "${API_BASE}/api/v1/issues?limit=1")
          if [ "$HTTP_STATUS" != "200" ]; then
            echo "API smoke test failed with status: $HTTP_STATUS"
            cat /tmp/smoke-response.json 2>/dev/null || true
            exit 1
          fi
          jq -e 'has("data") and has("meta") and has("error")' /tmp/smoke-response.json
          echo "API smoke test passed"

  notify-success:
    name: Notify Release Success
    needs: [build-and-push, smoke-test]
    if: success()
    uses: ./.github/workflows/notify.yml
    with:
      status: success
      environment: prod
      version: ${{ needs.build-and-push.outputs.semver_tag }}
      message: "Release ${{ needs.build-and-push.outputs.semver_tag }} deployed"
    secrets:
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}

  notify-failure:
    name: Notify Release Failure
    needs: [build-and-push, deploy, smoke-test]
    if: failure()
    uses: ./.github/workflows/notify.yml
    with:
      status: failure
      environment: prod
      version: ${{ needs.build-and-push.outputs.semver_tag || 'unknown' }}
      message: "Release deployment failed"
    secrets:
      DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
```

- [ ] **Step 2: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"`
Expected: No output (valid YAML)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "feat: add release workflow with semver tagging, changelog, and GitHub Releases"
```

---

### Task 8: Update `scripts/deploy.sh`

**Files:**
- Modify: `scripts/deploy.sh`

- [ ] **Step 1: Update header comment**

Change line 4 from:
```bash
# deploy.sh — Called by GitHub Actions over SSH
```
to:
```bash
# deploy.sh — Called by GitHub Actions (self-hosted runner on VPS)
```

No other changes needed — the script's env var requirements (`GHCR_TOKEN`, `GHCR_USERNAME`) and core logic remain the same. They're now passed natively by the runner instead of through SSH.

- [ ] **Step 2: Commit**

```bash
git add scripts/deploy.sh
git commit -m "chore: update deploy.sh comment to reflect self-hosted runner"
```

---

### Task 9: Update `scripts/backup-db.sh` (B2 Offsite Upload)

**Files:**
- Modify: `scripts/backup-db.sh`

- [ ] **Step 1: Add B2 upload after local backup**

After the existing rotation logic (after line 40), add the B2 upload section. Also add `ENV` variable at the top for the B2 path.

Add after line 11 (`WEEKLY_KEEP=${WEEKLY_KEEP:-4}`):
```bash
ENV="${ENV:-prod}"
```

Add after line 40 (`echo "[$(date)] Rotated weekly backups (keeping last $WEEKLY_KEEP)"`):
```bash

# Upload to Backblaze B2 (if configured)
if command -v b2 &>/dev/null && [ -n "${B2_BUCKET_NAME:-}" ]; then
    DUMP_FILENAME=$(basename "$DUMP_FILE")
    echo "[$(date)] Uploading to B2: gitfable/${ENV}/daily/${DUMP_FILENAME}"
    if b2 upload-file "$B2_BUCKET_NAME" "$DUMP_FILE" "gitfable/${ENV}/daily/${DUMP_FILENAME}"; then
        echo "[$(date)] B2 daily upload complete"
    else
        echo "[$(date)] WARN: B2 daily upload failed (non-fatal)"
    fi

    # Upload weekly copy to B2
    if [ "$DAY_OF_WEEK" -eq 7 ]; then
        if b2 upload-file "$B2_BUCKET_NAME" "$DUMP_FILE" "gitfable/${ENV}/weekly/${DUMP_FILENAME}"; then
            echo "[$(date)] B2 weekly upload complete"
        else
            echo "[$(date)] WARN: B2 weekly upload failed (non-fatal)"
        fi
    fi

    # Log uploaded file size for free tier awareness (10GB limit)
    echo "[$(date)] Uploaded backup size: $DUMP_SIZE"
else
    echo "[$(date)] B2 not configured, skipping offsite upload"
fi
```

- [ ] **Step 2: Commit**

```bash
git add scripts/backup-db.sh
git commit -m "feat: add Backblaze B2 offsite backup upload to backup-db.sh"
```

---

### Task 10: Update `scripts/provision.sh` (Replace Tailscale with Runner + B2)

**Files:**
- Modify: `scripts/provision.sh`

- [ ] **Step 1: Add GitHub Actions runner setup section**

After the "Create app directory" section (after line 114), add before the final echo:

```bash
# --- Install GitHub Actions runner ---
RUNNER_VERSION="2.321.0"
RUNNER_DIR="/home/deploy/actions-runner"

if [ ! -f "$RUNNER_DIR/run.sh" ]; then
    mkdir -p "$RUNNER_DIR"
    cd "$RUNNER_DIR"
    curl -o actions-runner.tar.gz -L "https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz"
    tar xzf actions-runner.tar.gz
    rm actions-runner.tar.gz
    chown -R deploy:deploy "$RUNNER_DIR"
    echo "GitHub Actions runner extracted to $RUNNER_DIR"
    echo "NOTE: You must register the runner manually as 'deploy' user:"
    echo "  su - deploy"
    echo "  cd $RUNNER_DIR"
    echo "  ./config.sh --url https://github.com/YOUR_ORG/YOUR_REPO --token YOUR_TOKEN --labels self-hosted,vps-prod"
    echo "  sudo ./svc.sh install"
    echo "  sudo ./svc.sh start"
else
    echo "GitHub Actions runner already installed"
fi

# --- Install B2 CLI for offsite backups ---
if ! command -v b2 &>/dev/null; then
    apt install -y python3-pip
    pip3 install b2 --break-system-packages
    echo "B2 CLI installed"
else
    echo "B2 CLI already installed"
fi
```

- [ ] **Step 2: Update the final "Next steps" output**

Replace the existing "Next steps" block (lines 118-122) with:

```bash
echo ""
echo "=== Provisioning complete ==="
echo "Next steps:"
echo "  1. Log out and SSH in as: ssh deploy@$(hostname -I | awk '{print $1}')"
echo "  2. Register GitHub Actions runner:"
echo "     cd ~/actions-runner"
echo "     ./config.sh --url https://github.com/nishantg96/gitfable-app --token <TOKEN> --labels self-hosted,vps-<ENV>"
echo "     sudo ./svc.sh install && sudo ./svc.sh start"
echo "  3. Copy docker-compose and env files to /home/deploy/gitfable/"
echo "  4. Create secrets in /home/deploy/gitfable/docker/secrets/"
echo "  5. Configure B2 credentials for offsite backups (optional):"
echo "     export B2_APPLICATION_KEY_ID=... B2_APPLICATION_KEY=... B2_BUCKET_NAME=..."
echo "  6. Run: cd ~/gitfable && docker compose -f docker-compose.vps-<env>.yml up -d"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/provision.sh
git commit -m "feat: add GitHub Actions runner setup and B2 CLI to provision.sh"
```

---

### Task 11: Update `scripts/bootstrap-github-secrets.sh`

**Files:**
- Modify: `scripts/bootstrap-github-secrets.sh`

- [ ] **Step 1: Remove Tailscale vars from `required_vars` array**

Remove these 4 lines from the `required_vars` array (lines 31-34):
```bash
  TS_OAUTH_CLIENT_ID
  TS_OAUTH_SECRET
  DEV_TAILSCALE_HOST
  PROD_TAILSCALE_HOST
```

- [ ] **Step 2: Remove Tailscale `gh secret set` calls**

Remove these 4 lines (lines 51-54):
```bash
gh secret set TS_OAUTH_CLIENT_ID --body "$TS_OAUTH_CLIENT_ID"
gh secret set TS_OAUTH_SECRET --body "$TS_OAUTH_SECRET"
gh secret set DEV_TAILSCALE_HOST --body "$DEV_TAILSCALE_HOST"
gh secret set PROD_TAILSCALE_HOST --body "$PROD_TAILSCALE_HOST"
```

- [ ] **Step 3: Add `DISCORD_WEBHOOK_URL` to required vars and secret setting**

Add `DISCORD_WEBHOOK_URL` to the `required_vars` array.

Add after the prod secrets block:
```bash
echo "Setting shared secrets..."
gh secret set DISCORD_WEBHOOK_URL --body "$DISCORD_WEBHOOK_URL"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/bootstrap-github-secrets.sh
git commit -m "chore: remove Tailscale secrets, add Discord webhook to bootstrap script"
```

---

### Task 12: Final Validation

- [ ] **Step 1: Validate all YAML files**

Run:
```bash
for f in .github/workflows/*.yml; do
  echo "Checking $f..."
  python3 -c "import yaml; yaml.safe_load(open('$f'))" && echo "  OK" || echo "  FAIL"
done
```
Expected: All OK

- [ ] **Step 2: Verify no references to deleted files remain**

Run:
```bash
grep -r "docker-compose.prod.yml" --include="*.yml" --include="*.yaml" --include="Makefile" --include="*.sh" --include="*.md" . | grep -v "docs/superpowers" | grep -v ".git/"
```
Expected: No output (no remaining references)

Run:
```bash
grep -r "tailscale-connectivity" --include="*.yml" --include="*.yaml" --include="*.sh" --include="*.md" . | grep -v "docs/superpowers" | grep -v ".git/"
```
Expected: No output

- [ ] **Step 3: Verify no Tailscale references in workflows**

Run:
```bash
grep -r "tailscale" .github/workflows/
```
Expected: No output

- [ ] **Step 4: Verify all workflows reference notify.yml correctly**

Run:
```bash
grep -l "notify.yml" .github/workflows/*.yml
```
Expected: deploy-dev.yml, deploy-prod.yml, rollback-dev.yml, rollback-prod.yml, release.yml

- [ ] **Step 5: Run project tests to confirm no regressions**

Run: `cd backend && go test ./... -v`
Run: `cd frontend && npm test -- --watchAll=false`
Expected: All pass (no application code changed)
