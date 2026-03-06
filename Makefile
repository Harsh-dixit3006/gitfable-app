.PHONY: help install install-backend install-frontend dev dev-backend dev-frontend build test test-backend clean lint env docker-build docker-up docker-down docker-logs

# Default target
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ─── Install ─────────────────────────────────────────────────────────

install: install-backend install-frontend ## Install all dependencies

install-backend: ## Install backend Python dependencies using UV
	cd backend && uv sync

install-frontend: ## Install frontend Node dependencies
	cd frontend && yarn install

# ─── Development ─────────────────────────────────────────────────────

dev: ## Start both backend and frontend (requires two terminals)
	@echo "Run in separate terminals:"
	@echo "  make dev-backend"
	@echo "  make dev-frontend"

dev-backend: ## Start backend dev server (port 8001)
	cd backend && uv run uvicorn app.main:app --reload --host 0.0.0.0 --port 8001

dev-frontend: ## Start frontend dev server (port 3000)
	cd frontend && yarn start

# ─── Build ───────────────────────────────────────────────────────────

build: ## Build frontend for production
	cd frontend && yarn build

# ─── Testing ─────────────────────────────────────────────────────────

test: test-backend ## Run all tests

test-backend: ## Run backend pytest suite
	cd backend && uv run pytest tests/ -v

# ─── Code Quality ────────────────────────────────────────────────────

lint: ## Lint frontend code
	cd frontend && npx eslint src/ --ext .js,.jsx

# ─── Cleanup ─────────────────────────────────────────────────────────

clean: ## Remove build artifacts and caches
	rm -rf frontend/build
	rm -rf frontend/node_modules/.cache
	find backend -type d -name __pycache__ -exec rm -rf {} + 2>/dev/null || true
	find backend -name "*.pyc" -delete 2>/dev/null || true
	rm -f backend/uv.lock

# ─── Environment Setup ───────────────────────────────────────────────

env: ## Create .env files from examples
	@test -f backend/.env || (cp backend/.env.example backend/.env && echo "Created backend/.env")
	@test -f frontend/.env || (cp frontend/.env.example frontend/.env && echo "Created frontend/.env")
	@echo "Edit .env files with your local values"

# ─── UV Commands ─────────────────────────────────────────────────────

lock: ## Update uv.lock with latest dependencies
	cd backend && uv lock

add: ## Add a Python package (usage: make add PKG=fastapi)
	@if [ -z "$(PKG)" ]; then echo "Usage: make add PKG=package-name"; exit 1; fi
	cd backend && uv add $(PKG)

add-dev: ## Add a dev Python package (usage: make add-dev PKG=pytest)
	@if [ -z "$(PKG)" ]; then echo "Usage: make add-dev PKG=package-name"; exit 1; fi
	cd backend && uv add --dev $(PKG)

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
