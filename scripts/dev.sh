#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="gitfable"

if [ ! -f "$ROOT_DIR/docker/.env" ]; then
  echo "Error: docker/.env not found. Run 'make env' first."
  exit 1
fi

# Start infra
echo "Starting postgres and redis..."
docker compose -f "$ROOT_DIR/docker/docker-compose.yml" up -d postgres redis

echo "Waiting for postgres..."
docker compose -f "$ROOT_DIR/docker/docker-compose.yml" exec postgres sh -c \
  'until pg_isready -U gitfable -d gitfable -q; do sleep 1; done'

# Kill existing session if any
tmux kill-session -t "$SESSION" 2>/dev/null || true

# Build commands
BACKEND_CMD="set -a && . $ROOT_DIR/docker/.env && set +a && cd $ROOT_DIR/backend && (command -v air >/dev/null 2>&1 && air || go run ./cmd/server)"
FRONTEND_CMD="set -a && . $ROOT_DIR/docker/.env && set +a && cd $ROOT_DIR/frontend && PORT=3000 npm start"

# Create tmux session with backend in first pane
tmux new-session -d -s "$SESSION" -n dev "$BACKEND_CMD"

# Enable mouse support (click panes, scroll, resize)
tmux set-option -t "$SESSION" mouse on

# Split horizontally and run frontend in second pane
tmux split-window -h -t "$SESSION:dev" "$FRONTEND_CMD"

# Select the backend pane (left)
tmux select-pane -t "$SESSION:dev.0"

# Attach
echo "Attaching to tmux session '$SESSION'..."
echo "  Ctrl-b + arrow keys to switch panes"
echo "  Ctrl-b d to detach (services keep running)"
echo "  make dev-stop to stop everything"
exec tmux attach -t "$SESSION"
