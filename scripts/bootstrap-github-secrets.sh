#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   1) Create .secrets/all.env from the template in docs/ops/SECRETS_SETUP.md or below
#   2) Fill values
#   3) Run: ./scripts/bootstrap-github-secrets.sh .secrets/all.env

ENV_FILE="${1:-.secrets/all.env}"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh CLI not found. Install GitHub CLI first."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run: gh auth login"
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file not found: $ENV_FILE"
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

required_vars=(
  TS_OAUTH_CLIENT_ID
  TS_OAUTH_SECRET
  DEV_TAILSCALE_HOST
  PROD_TAILSCALE_HOST
  SUPABASE_DEV_PROJECT_URL
  SUPABASE_DEV_ANON_KEY
  SUPABASE_PROD_PROJECT_URL
  SUPABASE_PROD_ANON_KEY
  DEV_BACKEND_URL
  PROD_BACKEND_URL
)

for v in "${required_vars[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "Error: missing required variable: $v"
    exit 1
  fi
done

echo "Setting shared secrets..."
gh secret set TS_OAUTH_CLIENT_ID --body "$TS_OAUTH_CLIENT_ID"
gh secret set TS_OAUTH_SECRET --body "$TS_OAUTH_SECRET"
gh secret set DEV_TAILSCALE_HOST --body "$DEV_TAILSCALE_HOST"
gh secret set PROD_TAILSCALE_HOST --body "$PROD_TAILSCALE_HOST"

echo "Setting dev secrets..."
gh secret set DEV_REACT_APP_BACKEND_URL --body "$DEV_BACKEND_URL"
gh secret set DEV_REACT_APP_SUPABASE_URL --body "$SUPABASE_DEV_PROJECT_URL"
gh secret set DEV_REACT_APP_SUPABASE_ANON_KEY --body "$SUPABASE_DEV_ANON_KEY"
gh secret set DEV_BACKEND_HEALTH_URL --body "${DEV_BACKEND_URL%/}/health"
gh secret set DEV_BACKEND_READY_URL --body "${DEV_BACKEND_URL%/}/ready"

echo "Setting prod secrets..."
gh secret set PROD_REACT_APP_BACKEND_URL --body "$PROD_BACKEND_URL"
gh secret set PROD_REACT_APP_SUPABASE_URL --body "$SUPABASE_PROD_PROJECT_URL"
gh secret set PROD_REACT_APP_SUPABASE_ANON_KEY --body "$SUPABASE_PROD_ANON_KEY"
gh secret set PROD_BACKEND_HEALTH_URL --body "${PROD_BACKEND_URL%/}/health"
gh secret set PROD_BACKEND_READY_URL --body "${PROD_BACKEND_URL%/}/ready"

if [[ -n "${GITHUB_WEBHOOK_SECRET:-}" ]]; then
  gh secret set GITHUB_WEBHOOK_SECRET --body "$GITHUB_WEBHOOK_SECRET"
fi

echo "Done. Current GitHub secrets:"
gh secret list
