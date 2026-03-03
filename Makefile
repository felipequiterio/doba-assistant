export PATH := $(HOME)/.bun/bin:$(PATH)

.PHONY: help db db-stop db-reset dev build test lint migrate migrate-generate clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- Database ---

db: ## Start PostgreSQL in Docker
	docker compose up -d postgres

db-stop: ## Stop PostgreSQL
	docker compose down

db-reset: ## Destroy and recreate PostgreSQL volume
	docker compose down -v
	docker compose up -d postgres

db-logs: ## Tail PostgreSQL logs
	docker compose logs -f postgres

# --- Backend ---

dev: ## Start backend dev server
	cd backend-ts && bun run src/server.ts

build: ## Type-check the backend
	cd backend-ts && bun run tsc --noEmit

test: ## Run backend tests
	cd backend-ts && bun test

lint: ## Lint and format check
	cd backend-ts && bun run tsc --noEmit

# --- Migrations ---

migrate: ## Apply database migrations
	cd backend-ts && bunx drizzle-kit migrate

migrate-generate: ## Generate migration from schema changes
	cd backend-ts && bunx drizzle-kit generate

migrate-push: ## Push schema directly (dev only, no migration files)
	cd backend-ts && bunx drizzle-kit push

# --- Setup ---

install: ## Install backend dependencies
	cd backend-ts && bun install

setup: db install migrate ## Full project setup: start DB, install deps, run migrations

# --- Cleanup ---

clean: ## Remove node_modules and build artifacts
	rm -rf backend-ts/node_modules backend-ts/bun.lockb
