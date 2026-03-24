#!/usr/bin/env bash
set -euo pipefail

# deploy.sh — Called by GitHub Actions (self-hosted runner on VPS)
# Usage: ./deploy.sh <environment> <image_tag>
# Example: ./deploy.sh prod prod-abc1234
#
# The script uses two directories:
#   REPO_DIR  — the Git checkout (compose files, caddy config, migrations)
#   VPS_DIR   — persistent VPS directory (env files, Docker secrets)
#
# When run by the self-hosted runner, REPO_DIR is the runner's work directory
# (detected via GITHUB_WORKSPACE). VPS_DIR is always /home/deploy/gitfable.

ENV="${1:?Usage: deploy.sh <prod|dev> <image_tag>}"
IMAGE_TAG="${2:?Usage: deploy.sh <prod|dev> <image_tag>}"

if [[ "$ENV" != "prod" && "$ENV" != "dev" ]]; then
    echo "ERROR: Environment must be 'prod' or 'dev', got: $ENV"
    exit 1
fi

: "${GHCR_TOKEN:?ERROR: GHCR_TOKEN environment variable is required}"

# Repo files come from the checkout; VPS-specific files from the persistent directory
REPO_DIR="${GITHUB_WORKSPACE:-/home/deploy/gitfable}"
VPS_DIR="/home/deploy/gitfable"

COMPOSE_FILE="$REPO_DIR/docker/docker-compose.vps-${ENV}.yml"
ENV_FILE="$VPS_DIR/docker/.env.vps-${ENV}"
SECRETS_DIR="$VPS_DIR/docker/secrets"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "ERROR: Compose file not found: $COMPOSE_FILE"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: Environment file not found: $ENV_FILE"
    echo "Create it from template on VPS:"
    echo "  cp $VPS_DIR/docker/.env.vps-${ENV}.example $ENV_FILE"
    exit 1
fi

for s in postgres_user.txt postgres_password.txt redis_password.txt; do
    if [ ! -f "$SECRETS_DIR/$s" ]; then
        echo "ERROR: Docker secret file not found: $SECRETS_DIR/$s"
        exit 1
    fi
done

echo "=== Deploying GitFable ($ENV) with tag: $IMAGE_TAG ==="
echo "Repo dir: $REPO_DIR"
echo "VPS dir:  $VPS_DIR"

# When running from a checkout (not the VPS dir), symlink VPS-specific files
# so docker compose can resolve relative paths in the compose file
if [ "$REPO_DIR" != "$VPS_DIR" ]; then
    echo "Linking VPS config files into checkout..."
    ln -sfn "$VPS_DIR/docker/secrets" "$REPO_DIR/docker/secrets"
    ln -sfn "$ENV_FILE" "$REPO_DIR/docker/.env.vps-${ENV}"
fi

# Login to GHCR (token and username passed as env vars by GitHub Actions)
: "${GHCR_USERNAME:?ERROR: GHCR_USERNAME environment variable is required}"
echo "$GHCR_TOKEN" | docker login ghcr.io -u "$GHCR_USERNAME" --password-stdin

# Set the image tag for this deploy
export IMAGE_TAG="$IMAGE_TAG"

# Pull new images
echo "Pulling images..."
docker compose -f "$COMPOSE_FILE" pull backend frontend

# Deploy with zero-downtime (recreate only changed services)
echo "Starting services..."
docker compose -f "$COMPOSE_FILE" up -d --remove-orphans

# Wait for backend to be healthy
echo "Waiting for backend health check..."
RETRIES=30
until docker inspect --format='{{.State.Health.Status}}' "gitfable-backend-${ENV}" 2>/dev/null | grep -q "healthy"; do
    RETRIES=$((RETRIES - 1))
    if [ $RETRIES -le 0 ]; then
        echo "ERROR: Backend failed health check after 60s"
        echo "Logs:"
        docker compose -f "$COMPOSE_FILE" logs --tail 50 backend
        exit 1
    fi
    sleep 2
done

echo "Backend healthy!"

# Run database migrations.
# In production, migrations do NOT run on startup (only in dev). Run them explicitly here.
echo "Running database migrations..."
DB_NAME="gitfable_${ENV}"
NETWORK="gitfable-${ENV}_gitfable-network"
POSTGRES_USER=$(docker exec "gitfable-postgres-${ENV}" cat /run/secrets/postgres_user)

docker run --rm \
  --network "$NETWORK" \
  -v "$REPO_DIR/backend/sql/migrations:/migrations" \
  migrate/migrate \
  -path=/migrations \
  -database="postgresql://${POSTGRES_USER}:$(docker exec "gitfable-postgres-${ENV}" cat /run/secrets/postgres_password)@gitfable-postgres-${ENV}:5432/${DB_NAME}?sslmode=disable" \
  up

echo "Migrations complete!"

echo "=== Deploy complete ($ENV) ==="
docker compose -f "$COMPOSE_FILE" ps
