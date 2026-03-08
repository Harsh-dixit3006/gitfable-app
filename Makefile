.PHONY: help install install-backend install-frontend dev dev-stop dev-backend dev-frontend build build-backend sync-issues build-sync test test-backend clean lint lint-backend env generate migrate-up migrate-down docker-build docker-up docker-down docker-logs

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Install ─────────────────────────────────────────────────────────

install: install-backend install-frontend ## Install all dependencies

install-backend: ## Install backend Go dependencies
	cd backend && go mod download

install-frontend: ## Install frontend Node dependencies
	cd frontend && npm install

# ─── Development ─────────────────────────────────────────────────────

dev: ## Start infra (Docker) + backend & frontend (tmux split)
	@scripts/dev.sh

dev-stop: ## Stop all dev services (tmux + Docker)
	@tmux kill-session -t gitfable 2>/dev/null || true
	@docker compose -f docker/docker-compose.yml down

dev-backend: ## Start backend dev server (port 8001)
	@test -f docker/.env || (echo "Error: docker/.env not found. Run 'make env' first." && exit 1)
	@set -a && . docker/.env && set +a && command -v air >/dev/null 2>&1 && (cd backend && air) || (cd backend && go run ./cmd/server)

dev-frontend: ## Start frontend dev server (port 3000)
	@test -f docker/.env || (echo "Error: docker/.env not found. Run 'make env' first." && exit 1)
	@set -a && . docker/.env && set +a && cd frontend && npm start

# ─── Build ───────────────────────────────────────────────────────────

build: build-backend ## Build frontend and backend for production
	cd frontend && npm run build

build-backend: ## Build backend Go binary
	cd backend && go build -o bin/server ./cmd/server

sync-issues: ## Run a one-time issue sync from GitHub
	cd backend && go run ./cmd/sync

build-sync: ## Build the sync CLI binary
	cd backend && go build -o bin/sync ./cmd/sync

# ─── Testing ─────────────────────────────────────────────────────────

test: test-backend ## Run all tests

test-backend: ## Run backend tests with verbose output
	cd backend && go test ./... -v

# ─── Code Quality ────────────────────────────────────────────────────

lint: lint-backend ## Lint frontend and backend code
	cd frontend && npx eslint src/ --ext .js,.jsx

lint-backend: ## Lint backend Go code
	cd backend && golangci-lint run

# ─── Code Generation ────────────────────────────────────────────────

generate: ## Generate Go code from sqlc queries
	cd backend && sqlc generate

# ─── Database Migrations ────────────────────────────────────────────

migrate-up: ## Run database migrations up
	cd backend && migrate -path sql/migrations -database "$$DATABASE_URL" up

migrate-down: ## Roll back the last database migration
	cd backend && migrate -path sql/migrations -database "$$DATABASE_URL" down 1

# ─── Cleanup ─────────────────────────────────────────────────────────

clean: ## Remove build artifacts and caches
	rm -rf frontend/build
	rm -rf frontend/node_modules/.cache
	rm -rf backend/bin

# ─── Environment Setup ───────────────────────────────────────────────

env: ## Create docker/.env from example
	@test -f docker/.env || (cp docker/.env.example docker/.env && echo "Created docker/.env from example")
	@echo "Edit docker/.env with your local values (Firebase path, GitHub token)"

# ─── Docker ──────────────────────────────────────────────────────────

docker-build: ## Build all Docker images
	docker compose -f docker/docker-compose.yml build

docker-up: ## Start all services with Docker Compose
	docker compose -f docker/docker-compose.yml up -d

docker-down: ## Stop all Docker services
	docker compose -f docker/docker-compose.yml down

docker-logs: ## View logs from all services
	docker compose -f docker/docker-compose.yml logs -f

docker-backend-logs: ## View backend logs only
	docker compose -f docker/docker-compose.yml logs -f backend

docker-frontend-logs: ## View frontend logs only
	docker compose -f docker/docker-compose.yml logs -f frontend

docker-clean: ## Remove all containers, volumes, and images
	docker compose -f docker/docker-compose.yml down -v --rmi all

docker-prod-build: ## Build production images
	docker compose -f docker/docker-compose.prod.yml build

docker-prod-up: ## Start production services
	docker compose -f docker/docker-compose.prod.yml up -d
