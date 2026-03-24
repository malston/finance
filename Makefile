.PHONY: help install dev build lint test test-watch \
       go-vet go-test go-test-integration \
       py-setup py-test py-test-all \
       e2e e2e-go e2e-bash \
       docker-up docker-up-backend docker-down \
       backfill test-all check

help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}'

# --- Next.js / TypeScript ---

install: ## Install Node dependencies
	pnpm install

dev: ## Start dev server (Turbopack, port 3000)
	pnpm dev

build: ## Production build
	pnpm build

lint: ## Run ESLint
	pnpm lint

test: ## Run Vitest tests
	pnpm test

test-watch: ## Run Vitest in watch mode
	pnpm test:watch

# --- Go (Ingestion) ---

go-vet: ## Lint Go code
	cd services/ingestion && go vet ./...

go-test: ## Run Go unit tests
	cd services/ingestion && go test -count=1 ./...

go-test-integration: ## Run Go integration tests (requires Docker)
	cd services/ingestion && go test -tags=integration -count=1 ./...

# --- Python (Correlation) ---

py-setup: ## Create venv and install Python deps
	cd services/correlation && python3 -m venv .venv && \
		. .venv/bin/activate && pip install -r requirements.txt

py-test: ## Run Python unit tests only
	cd services/correlation && . .venv/bin/activate && \
		python -m pytest -v -k "not integration and not dispatch_wiring and not e2e"

py-test-all: ## Run full Python test suite (requires DATABASE_URL)
	cd services/correlation && . .venv/bin/activate && \
		python -m pytest -v

# --- E2E ---

e2e: ## Run Playwright E2E tests (e2e/)
	pnpm exec playwright test

e2e-go: ## Run Go E2E tests (test/e2e/, requires Docker)
	cd test/e2e && go test -count=1 -v ./...

e2e-bash: ## Run bash E2E scripts (tests/)
	@for f in tests/e2e-*.sh; do echo "=== $$f ===" && bash "$$f"; done

# --- Docker ---

docker-up: ## Build and start full stack (4 services)
	docker compose up -d --build

docker-up-backend: ## Build and start backend only (db, ingestion, correlation)
	docker compose up -d --build timescaledb ingestion correlation

docker-down: ## Tear down stack (removes volumes -- destroys DB data)
	docker compose down -v --remove-orphans

# --- Data ---

backfill: ## Backfill historical data (requires FRED_API_KEY)
	./scripts/backfill-week.sh

# --- Combined ---

test-all: test go-test py-test ## Run all unit tests (TS + Go + Python)

check: lint go-vet test go-test py-test ## Lint + all unit tests (TS, Go, Python)
