.PHONY: help install install-backend install-frontend dev dev-backend dev-frontend build build-backend test test-backend clean lint lint-backend env generate migrate-up migrate-down docker-build docker-up docker-down docker-logs

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Install ─────────────────────────────────────────────────────────

install: install-backend install-frontend ## Install all dependencies

install-backend: ## Install backend Go dependencies
	cd backend && go mod download

install-frontend: ## Install frontend Node dependencies
	cd frontend && yarn install

# ─── Development ─────────────────────────────────────────────────────

dev: ## Start both backend and frontend (requires two terminals)
	@echo "Run in separate terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

dev-backend: ## Start backend dev server (port 8001)
	@command -v air >/dev/null 2>&1 && (cd backend && air) || (cd backend && go run ./cmd/server)

dev-frontend: ## Start frontend dev server (port 3000)
	cd frontend && yarn start

# ─── Build ───────────────────────────────────────────────────────────

build: build-backend ## Build frontend and backend for production
	cd frontend && yarn build

build-backend: ## Build backend Go binary
	cd backend && go build -o bin/server ./cmd/server

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
	cd backend && go run ./cmd/server migrate up

migrate-down: ## Roll back the last database migration
	cd backend && go run ./cmd/server migrate down

# ─── Cleanup ─────────────────────────────────────────────────────────

clean: ## Remove build artifacts and caches
	rm -rf frontend/build
	rm -rf frontend/node_modules/.cache
	rm -rf backend/bin

# ─── Environment Setup ───────────────────────────────────────────────

env: ## Create .env files from examples
	@test -f backend/.env || (cp backend/.env.example backend/.env && echo "Created backend/.env")
	@test -f frontend/.env || (cp frontend/.env.example frontend/.env && echo "Created frontend/.env")
	@echo "Edit .env files with your local values"

# ─── Docker ──────────────────────────────────────────────────────────

docker-build: ## Build all Docker images
	docker compose build

docker-up: ## Start all services with Docker Compose
	docker compose up -d

docker-down: ## Stop all Docker services
	docker compose down

docker-logs: ## View logs from all services
	docker compose logs -f

docker-backend-logs: ## View backend logs only
	docker compose logs -f backend

docker-frontend-logs: ## View frontend logs only
	docker compose logs -f frontend

docker-clean: ## Remove all containers, volumes, and images
	docker compose down -v --rmi all

docker-prod-build: ## Build production images
	docker compose -f docker-compose.prod.yml build

docker-prod-up: ## Start production services
	docker compose -f docker-compose.prod.yml up -d
