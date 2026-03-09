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

test-full-workflow: ## Run full E2E workflow test (requires GITHUB_TOKEN and TEST_GITHUB_USERNAME)
	@test -f docker/.env.test || (echo "Error: docker/.env.test not found. Copy docker/.env.test.example to docker/.env.test and add your credentials." && exit 1)
	@echo "Running full workflow tests in Docker..."
	@docker compose -f docker/docker-compose.test.yml --env-file docker/.env.test up --abort-on-container-exit

test-full-workflow-local: ## Run full E2E workflow test locally (requires env vars)
	@test -n "$(GITHUB_TOKEN)" || (echo "Error: GITHUB_TOKEN not set" && exit 1)
	@test -n "$(TEST_GITHUB_USERNAME)" || (echo "Error: TEST_GITHUB_USERNAME not set" && exit 1)
	cd backend && GITHUB_TOKEN=$(GITHUB_TOKEN) TEST_GITHUB_USERNAME=$(TEST_GITHUB_USERNAME) go test -v ./internal/handler -run TestFullWorkflow

test-docker: ## Run all tests in Docker container
	@docker compose -f docker/docker-compose.test.yml --env-file docker/.env.test up --abort-on-container-exit

test-docker-down: ## Stop test Docker containers
	@docker compose -f docker/docker-compose.test.yml down -v

test-cleanup: ## Clean up test database and containers
	@docker compose -f docker/docker-compose.test.yml down -v
	@docker volume rm gitfable_postgres_test_data gitfable_redis_test_data 2>/dev/null || true
	env-test: ## Create docker/.env.test from example
	@test -f docker/.env.test || (cp docker/.env.test.example docker/.env.test && echo "Created docker/.env.test from example. Edit it to add your credentials.")

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
