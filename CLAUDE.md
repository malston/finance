# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bookstaber Financial Risk Monitor -- a systemic risk dashboard tracking four interconnected risk domains (Private Credit, AI/Tech Concentration, Energy/Geopolitical, Cross-Domain Contagion) with rolling correlation-based contagion detection.

## Architecture

Three independent services communicate via a shared TimescaleDB instance:

```text
Ingestion (Go)  ──writes──>  TimescaleDB  <──reads──  Correlation (Python)
                                 ^                          │
                                 │                    writes scores,
                                 │                    correlations,
                            reads via                  alerts
                            API routes                      │
                                 │                          v
                          Next.js App  <────────────  Scoring + Alerting
```

- **Ingestion** (`services/ingestion/`): Go service with tiered polling -- Finnhub (5min REST + WebSocket), FRED (daily), Valyu (hourly/daily). Writes raw market data to `time_series`.
- **Correlation** (`services/correlation/`): Python service computing domain indices, rolling 30-day Pearson correlations, threat scores (0-100), and alert evaluation. Runs every 5 minutes.
- **Dashboard** (`src/`): Next.js 15 app with API routes that query TimescaleDB. Dark-themed Recharts dashboard with React Query for data fetching.

All scoring weights, thresholds, and alert rules live in YAML config files -- not hardcoded in scoring logic.

## Build and Test Commands

### TypeScript (Next.js)

```bash
pnpm install          # Install dependencies
pnpm test             # Run all 381+ Vitest tests
pnpm test:watch       # Watch mode
pnpm build            # Production build
pnpm dev              # Dev server with Turbopack (port 3000)
```

### Go (Ingestion Service)

```bash
cd services/ingestion
go vet ./...                              # Lint
go test -count=1 ./...                    # Unit tests (7 packages)
go test -tags=integration -count=1 ./...  # Integration tests (requires Docker)
```

### Python (Correlation Service)

```bash
cd services/correlation
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -v -k "not integration and not dispatch_wiring"  # Unit tests only
python -m pytest -v                                                # Full suite (requires DATABASE_URL)
```

### Docker

```bash
docker compose up -d                          # Full stack (4 services)
docker compose up -d timescaledb ingestion correlation  # Backend only
docker compose down -v --remove-orphans       # Cleanup
```

## Environment Variables

```bash
FINNHUB_API_KEY       # Required -- finnhub.io free tier
FRED_API_KEY          # Required -- fred.stlouisfed.org (free, requires registration)
VALYU_API_KEY         # Required -- valyu.ai
TIMESCALEDB_PASSWORD  # Default: riskmonitor
DATABASE_URL          # postgresql://risk:riskmonitor@localhost:5432/riskmonitor
# Optional: SENDGRID_API_KEY, SLACK_WEBHOOK_URL (for alert dispatch)
```

## Key Config Files

| File                                       | Purpose                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `services/ingestion/config.yaml`           | Tickers, polling intervals, API keys (env vars), staleness thresholds         |
| `services/correlation/scoring_config.yaml` | Domain weights (0.30/0.20/0.25/0.25), sub-component thresholds, threat levels |
| `services/correlation/alert_config.yaml`   | Alert rules, consecutive readings, cooldowns, channel config                  |
| `docker-compose.yml`                       | Service orchestration, health checks, volumes                                 |
| `services/db/init.sql`                     | TimescaleDB schema (hypertable, indexes, all tables)                          |

## API Routes

All under `src/app/api/risk/`:

| Endpoint                               | Purpose                                        |
| -------------------------------------- | ---------------------------------------------- |
| `/api/risk/scores`                     | Composite + 4 domain scores with threat levels |
| `/api/risk/correlations?days=N`        | Rolling pairwise correlations (3 pairs)        |
| `/api/risk/health`                     | Source staleness and failure tracking          |
| `/api/risk/timeseries?ticker=X&days=N` | Historical values for charting                 |
| `/api/risk/latest-prices`              | Most recent price per display ticker           |
| `/api/risk/news?domain=X&limit=N`      | Sentiment headlines by domain                  |
| `/api/risk/freshness`                  | Per-ticker data age and status                 |
| `/api/risk/alerts`                     | Alert history (GET) and acknowledgement (POST) |

## Scoring System

Four domain scorers produce 0-100 scores, combined into a weighted composite:

- **Private Credit** (0.30): HY spread, BDC NAV discount, redemption flow, spread ROC
- **AI Concentration** (0.20): SPY/RSP ratio, SMH relative, top-10 weight proxy
- **Energy/Geo** (0.25): Crude level/volatility, EWT drawdown
- **Contagion** (0.25): Max pairwise correlation, VIX level

Threat levels: LOW (0-25), ELEVATED (26-50), HIGH (51-75), CRITICAL (76-100).

Missing domains are renormalized (weights redistribute). Scorers return `None` (not 0) when data is unavailable. `fetch_latest_value` enforces a 2-hour staleness window via `max_age_hours`.

## Data Source Tiering

Cost optimization -- Finnhub (free) handles all high-frequency polling, Valyu (paid) only for low-frequency enrichment:

- **Finnhub**: 16 equity tickers (5min REST) + CL=F, NG=F (WebSocket)
- **FRED**: Credit spreads + Treasury yields (daily)
- **Valyu**: SEC filings (daily), news sentiment (hourly, market hours only), insider trading (daily)

## Testing Patterns

- **TypeScript**: Vitest with `@testing-library/react`. API route tests mock `@/lib/timescaledb`. Component tests use `@/test/query-test-utils.tsx` for React Query wrapper.
- **Go**: Standard `testing` package with `httptest.Server` for HTTP mocking. Integration tests use `testcontainers-go` for real TimescaleDB.
- **Python**: pytest with fixtures. Unit tests use pure functions (`score_*_from_values`). Integration tests require `DATABASE_URL` pointing to a running TimescaleDB.

## Known Limitations

- VIX polled as VIXY (ETF proxy) -- real VIX unavailable on Finnhub free tier
- MOVE and SKEW indices unavailable -- contagion scorer uses 2 of originally planned 4 sub-components
- News sentiment only fetched during US market hours (9:30 AM - 4:00 PM ET)
- Correlation computation requires 30+ trading days of price history to produce values
