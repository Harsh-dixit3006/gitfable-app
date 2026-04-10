#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   1) Create .secrets/all.env with GitHub Actions secret names as keys
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
  PROD_REACT_APP_BACKEND_URL
  PROD_BACKEND_HEALTH_URL
  PROD_BACKEND_READY_URL
)

optional_vars=(
  PROD_POSTGRES_USER
  PROD_POSTGRES_PASSWORD
  PROD_REDIS_PASSWORD
  PROD_GITHUB_OAUTH_CLIENT_ID
  PROD_GITHUB_OAUTH_CLIENT_SECRET
  PROD_JWT_SECRET
  APP_GITHUB_TOKEN
  GITHUB_WEBHOOK_SECRET
  DISCORD_WEBHOOK_URL
)

for v in "${required_vars[@]}"; do
  if [[ -z "${!v:-}" ]]; then
    echo "Error: missing required variable: $v"
    exit 1
  fi
done

echo "Setting prod secrets..."
gh secret set PROD_REACT_APP_BACKEND_URL --body "$PROD_REACT_APP_BACKEND_URL"
gh secret set PROD_BACKEND_HEALTH_URL --body "$PROD_BACKEND_HEALTH_URL"
gh secret set PROD_BACKEND_READY_URL --body "$PROD_BACKEND_READY_URL"

for v in "${optional_vars[@]}"; do
  if [[ -n "${!v:-}" ]]; then
    echo "Setting optional secret: $v"
    gh secret set "$v" --body "${!v}"
  fi
done

echo "Done. Current GitHub secrets:"
gh secret list
