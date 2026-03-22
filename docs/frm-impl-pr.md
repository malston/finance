# Financial Risk Monitor: Full implementation

## Summary

Complete implementation of the Bookstaber Financial Risk Monitor -- a systemic risk dashboard tracking four interconnected risk domains with cross-domain correlation-based contagion detection.

### Epic 1: Data Pipeline

- Go ingestion service with tiered polling: Finnhub (5-min REST + WebSocket for 18 tickers), FRED (daily credit spreads + Treasury yields), Valyu (hourly news sentiment + daily SEC filings + insider trading)
- TimescaleDB time series storage with common `{time, ticker, value, source}` format
- Source health tracking with per-source staleness thresholds
- Docker Compose orchestration

### Epic 2: Correlation Engine

- Python service computing 3 domain indices (Private Credit, AI/Tech, Energy)
- Rolling 30-day Pearson correlations for 3 pairwise combinations
- Correlation API endpoint with contagion threshold detection

### Epic 3: Threat Scoring

- 4 configurable domain scoring functions (Private Credit 0.30, AI Concentration 0.20, Energy/Geo 0.25, Contagion 0.25)
- Composite weighted threat score with threat level classification (LOW/ELEVATED/HIGH/CRITICAL)
- All thresholds from YAML config, missing data renormalization

### Epic 4: Dashboard

- Dark theme (#0a0e17) with IBM Plex Sans + JetBrains Mono
- Composite threat score display with 4 domain badges
- Correlation monitor AreaChart with contagion threshold reference line
- 4 collapsible sector panels with SVG threat gauges, sparklines, ticker tables
- Per-ticker freshness dots (green/yellow/red) with source-aware thresholds
- Stale data badges and source health indicator
- News sentiment sidebar with domain tabs
- Jargon tooltips for 7 financial terms
- Threat level legend

### Epic 5: Alerting

- Configurable threshold-based rule evaluation with consecutive readings
- Cooldown enforcement (no re-fire within window)
- Multi-channel dispatch: email (SendGrid), Slack (Block Kit), browser push (VAPID)
- Independent channel failure isolation

---

## Acceptance Criteria

### Prerequisites

```bash
# Clone and checkout
git clone https://github.com/malston/finance.git
cd finance
git checkout integrate/all-stories

# Install Node dependencies
pnpm install

# Install Python dependencies (for correlation service tests)
cd services/correlation
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ../..
```

### Environment Variables

```bash
# Required for Docker stack
export FINNHUB_API_KEY="<your-finnhub-free-tier-key>"   # Get from https://finnhub.io/register
export VALYU_API_KEY="<your-valyu-key>"                  # Get from https://valyu.ai
export TIMESCALEDB_PASSWORD="riskmonitor"                # Default for local dev

# Optional (for alert dispatch -- not needed for basic testing)
export SENDGRID_API_KEY="<your-sendgrid-key>"
export SLACK_WEBHOOK_URL="<your-slack-webhook>"
```

FRED API requires a free key: https://fred.stlouisfed.org/docs/api/api_key.html

### AC1: TypeScript Tests Pass (361+ tests)

```bash
pnpm test
```

Expected: All 361+ tests pass across 35 test files. Zero failures, zero skipped.

### AC2: Build Succeeds

```bash
pnpm build
```

Expected: Compiles with zero errors. Warnings are acceptable (pre-existing lint from upstream).

### AC3: Go Ingestion Service Compiles and Tests Pass

```bash
cd services/ingestion
go vet ./...
go test -count=1 ./...
cd ../..
```

Expected: `go vet` clean. All unit tests pass across 7+ packages (fred, finnhub, scheduler, config, store, computed, valyu).

### AC4: Go Integration Tests Pass (requires Docker)

```bash
cd services/ingestion
go test -tags=integration -count=1 ./...
cd ../..
```

Expected: All integration tests pass using testcontainers-go (spins up real TimescaleDB automatically).

### AC5: Python Correlation Service Tests Pass

```bash
cd services/correlation
source .venv/bin/activate
python -m pytest -v -k "not integration and not dispatch_wiring"
cd ../..
```

Expected: All unit tests pass (scoring, correlator, index builder, alerting rules engine, dispatch).

### AC6: Python Integration Tests Pass (requires running TimescaleDB)

```bash
# Start TimescaleDB first
docker compose up -d timescaledb
sleep 5

cd services/correlation
source .venv/bin/activate
export DATABASE_URL="postgresql://risk:riskmonitor@localhost:5432/riskmonitor"
python -m pytest -v
cd ../..
```

Expected: All integration tests pass against real TimescaleDB.

### AC7: Docker Compose Stack Starts

**Option A: Full Docker stack** (requires 8GB+ Docker memory)

```bash
docker compose up -d
docker compose ps
```

Expected: 4 services running: `timescaledb` (healthy), `ingestion` (running), `correlation` (running), `app` (running).

> **Note:** If the `app` container OOMs during build (`SIGKILL` / `cannot allocate memory`), use Option B instead. The Next.js production build is memory-intensive.

**Option B: Backend in Docker, app local** (recommended for development)

```bash
# Start backend services only
docker compose up -d timescaledb ingestion correlation

# Run Next.js locally (in a separate terminal)
pnpm dev
```

Expected: 3 Docker services running + Next.js dev server at `http://localhost:3000`.

### AC8: Dashboard Loads in Browser

```bash
# With stack running (either option):
open http://localhost:3000
```

Expected: Dark-themed dashboard with:

- Header: "BOOKSTABER RISK MONITOR" with live clock
- Composite Systemic Risk section
- Cross-Domain Correlation Monitor (AreaChart with contagion threshold line)
- 4 collapsible sector panels (Private Credit, AI/Tech, Energy/Geo, Contagion)
- Threat level legend at bottom
- News sentiment sidebar (desktop only, hidden on mobile)

### AC9: API Endpoints Return Valid JSON

```bash
# With stack running:
curl -s http://localhost:3000/api/risk/scores | jq .
curl -s http://localhost:3000/api/risk/correlations?days=79 | jq .
curl -s http://localhost:3000/api/risk/health | jq .
curl -s http://localhost:3000/api/risk/timeseries?ticker=BAMLH0A0HYM2\&days=79 | jq .
curl -s http://localhost:3000/api/risk/latest-prices | jq .
curl -s "http://localhost:3000/api/risk/news?domain=private_credit&limit=5" | jq .
curl -s http://localhost:3000/api/risk/freshness | jq .
curl -s http://localhost:3000/api/risk/alerts | jq .
```

Expected: All 8 endpoints return valid JSON with 200 status. Data may be empty arrays/nulls until ingestion has run.

### AC10: E2E Tests Pass (requires Docker)

```bash
# Data pipeline E2E
./tests/e2e-dashboard.sh

# Correlation engine E2E
./tests/e2e-correlation.sh

# Alerting E2E
./tests/e2e-alerting.sh
```

Expected: All E2E scripts pass. Each starts Docker, seeds data, runs assertions, and cleans up.

---

## Cleanup After Testing

```bash
docker compose down -v --remove-orphans
```
