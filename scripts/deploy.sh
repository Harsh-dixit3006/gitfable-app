#!/usr/bin/env bash
set -euo pipefail

# deploy.sh — Called by GitHub Actions (self-hosted runner on VPS)
# Usage: ./deploy.sh <environment> <image_tag>
# Example: ./deploy.sh prod prod-abc1234

ENV="${1:?Usage: deploy.sh <prod|dev> <image_tag>}"
IMAGE_TAG="${2:?Usage: deploy.sh <prod|dev> <image_tag>}"

if [[ "$ENV" != "prod" && "$ENV" != "dev" ]]; then
    echo "ERROR: Environment must be 'prod' or 'dev', got: $ENV"
    exit 1
fi

: "${GHCR_TOKEN:?ERROR: GHCR_TOKEN environment variable is required}"

APP_DIR="/home/deploy/gitfable"
COMPOSE_FILE="$APP_DIR/docker/docker-compose.vps-${ENV}.yml"
ENV_FILE="$APP_DIR/docker/.env.vps-${ENV}"
SECRETS_DIR="$APP_DIR/docker/secrets"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "ERROR: Compose file not found: $COMPOSE_FILE"
    exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
    echo "ERROR: Environment file not found: $ENV_FILE"
    echo "Create it from template on VPS:"
    echo "  cp $APP_DIR/docker/.env.vps-${ENV}.example $ENV_FILE"
    exit 1
fi

for s in postgres_user.txt postgres_password.txt redis_password.txt; do
    if [ ! -f "$SECRETS_DIR/$s" ]; then
        echo "ERROR: Docker secret file not found: $SECRETS_DIR/$s"
        exit 1
    fi
done

echo "=== Deploying GitFable ($ENV) with tag: $IMAGE_TAG ==="

cd "$APP_DIR"

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
  -v "$APP_DIR/backend/sql/migrations:/migrations" \
  migrate/migrate \
  -path=/migrations \
  -database="postgresql://${POSTGRES_USER}:$(docker exec "gitfable-postgres-${ENV}" cat /run/secrets/postgres_password)@gitfable-postgres-${ENV}:5432/${DB_NAME}?sslmode=disable" \
  up

echo "Migrations complete!"

echo "=== Deploy complete ($ENV) ==="
docker compose -f "$COMPOSE_FILE" ps
