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
  SUPABASE_DEV_PROJECT_URL
  SUPABASE_DEV_ANON_KEY
  SUPABASE_DEV_DATABASE_URL
  SUPABASE_PROD_PROJECT_URL
  SUPABASE_PROD_ANON_KEY
  SUPABASE_PROD_DATABASE_URL
  RAILWAY_DEV_TOKEN
  RAILWAY_DEV_SERVICE_NAME
  RAILWAY_PROD_TOKEN
  RAILWAY_PROD_SERVICE_NAME
  CLOUDFLARE_API_TOKEN
  CLOUDFLARE_ACCOUNT_ID
  CLOUDFLARE_DEV_PROJECT_NAME
  CLOUDFLARE_PROD_PROJECT_NAME
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
gh secret set CLOUDFLARE_API_TOKEN --body "$CLOUDFLARE_API_TOKEN"
gh secret set CLOUDFLARE_ACCOUNT_ID --body "$CLOUDFLARE_ACCOUNT_ID"

echo "Setting dev secrets..."
gh secret set RAILWAY_DEV_TOKEN --body "$RAILWAY_DEV_TOKEN"
gh secret set RAILWAY_DEV_SERVICE_NAME --body "$RAILWAY_DEV_SERVICE_NAME"
gh secret set DEV_DATABASE_URL --body "$SUPABASE_DEV_DATABASE_URL"
gh secret set DEV_REACT_APP_BACKEND_URL --body "$DEV_BACKEND_URL"
gh secret set DEV_REACT_APP_SUPABASE_URL --body "$SUPABASE_DEV_PROJECT_URL"
gh secret set DEV_REACT_APP_SUPABASE_ANON_KEY --body "$SUPABASE_DEV_ANON_KEY"
gh secret set DEV_BACKEND_HEALTH_URL --body "${DEV_BACKEND_URL%/}/health"
gh secret set DEV_BACKEND_READY_URL --body "${DEV_BACKEND_URL%/}/ready"
gh secret set CLOUDFLARE_DEV_PROJECT_NAME --body "$CLOUDFLARE_DEV_PROJECT_NAME"

echo "Setting prod secrets..."
gh secret set RAILWAY_PROD_TOKEN --body "$RAILWAY_PROD_TOKEN"
gh secret set RAILWAY_PROD_SERVICE_NAME --body "$RAILWAY_PROD_SERVICE_NAME"
gh secret set PROD_DATABASE_URL --body "$SUPABASE_PROD_DATABASE_URL"
gh secret set PROD_REACT_APP_BACKEND_URL --body "$PROD_BACKEND_URL"
gh secret set PROD_REACT_APP_SUPABASE_URL --body "$SUPABASE_PROD_PROJECT_URL"
gh secret set PROD_REACT_APP_SUPABASE_ANON_KEY --body "$SUPABASE_PROD_ANON_KEY"
gh secret set PROD_BACKEND_HEALTH_URL --body "${PROD_BACKEND_URL%/}/health"
gh secret set PROD_BACKEND_READY_URL --body "${PROD_BACKEND_URL%/}/ready"
gh secret set CLOUDFLARE_PROD_PROJECT_NAME --body "$CLOUDFLARE_PROD_PROJECT_NAME"

if [[ -n "${GITHUB_WEBHOOK_SECRET:-}" ]]; then
  gh secret set GITHUB_WEBHOOK_SECRET --body "$GITHUB_WEBHOOK_SECRET"
fi

echo "Done. Current GitHub secrets:"
gh secret list
