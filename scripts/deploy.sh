#!/usr/bin/env bash
set -euo pipefail

# deploy.sh — Called by GitHub Actions over SSH
# Usage: ./deploy.sh <environment> <image_tag>
# Example: ./deploy.sh prod prod-abc1234

ENV="${1:?Usage: deploy.sh <prod|dev> <image_tag>}"
IMAGE_TAG="${2:?Usage: deploy.sh <prod|dev> <image_tag>}"

APP_DIR="/home/deploy/gitfable"
COMPOSE_FILE="$APP_DIR/docker-compose.vps-${ENV}.yml"

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "ERROR: Compose file not found: $COMPOSE_FILE"
    exit 1
fi

echo "=== Deploying GitFable ($ENV) with tag: $IMAGE_TAG ==="

cd "$APP_DIR"

# Login to GHCR (token passed as env var by GitHub Actions)
echo "$GHCR_TOKEN" | docker login ghcr.io -u nishantg96 --password-stdin

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
echo "=== Deploy complete ($ENV) ==="
docker compose -f "$COMPOSE_FILE" ps
