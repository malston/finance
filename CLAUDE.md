# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Bookstaber Financial Risk Monitor — a systemic risk dashboard tracking four interconnected risk domains (Private Credit, AI/Tech Concentration, Energy/Geopolitical, Cross-Domain Contagion) with rolling correlation-based contagion detection.

## Architecture

Three independent services communicate via a shared TimescaleDB instance (no direct HTTP between services):

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

- **Ingestion** (`services/ingestion/`): Go service with tiered polling — Finnhub (5min REST + WebSocket), FRED (daily), Valyu (hourly/daily). Writes raw market data to `time_series`.
- **Correlation** (`services/correlation/`): Python service computing domain indices, rolling 30-day Pearson correlations, threat scores (0-100), and alert evaluation. Runs every 5 minutes.
- **Dashboard** (`src/`): Next.js 15 app with API routes that query TimescaleDB. Dark-themed Recharts dashboard with React Query for data fetching.

All scoring weights, thresholds, and alert rules live in YAML config files — not hardcoded in scoring logic.

## Directory Structure

```
├── src/                          # Next.js 15 app (~177 TS/TSX files)
│   ├── app/                      # Pages, layouts, API routes
│   │   ├── api/risk/             # Core risk API routes (8 endpoints)
│   │   ├── api/auth/             # OAuth integration (Valyu)
│   │   ├── api/charts/           # Chart rendering
│   │   ├── api/chat/             # AI chat sessions
│   │   ├── api/csvs/             # CSV management
│   │   ├── api/reports/          # PDF export (generate-pdf)
│   │   ├── api/enterprise/       # Enterprise inquiry
│   │   └── api/*-status/         # System status endpoints
│   ├── components/               # React components (60+)
│   │   └── ui/                   # shadcn/ui primitives (Radix UI + Tailwind)
│   ├── lib/                      # Utilities (timescaledb, freshness, threat-levels)
│   ├── hooks/                    # Custom React hooks
│   └── test/                     # Test helpers (query-test-utils.tsx)
├── services/
│   ├── ingestion/                # Go service (~32 files)
│   │   ├── config/               # Config loading
│   │   ├── finnhub/              # REST + WebSocket polling
│   │   ├── fred/                 # FRED API client
│   │   ├── valyu/                # Valyu API (budget, news, insider trades)
│   │   ├── scheduler/            # Cron-like task scheduling
│   │   ├── store/                # TimescaleDB persistence
│   │   └── computed/             # Derived metrics (ratios)
│   ├── correlation/              # Python service (~34 files)
│   │   ├── scoring/              # Domain scorers + composite
│   │   ├── alerting/             # Rules engine + dispatch channels
│   │   ├── correlator.py         # Pearson correlation computation
│   │   └── index_builder.py      # Domain index calculation
│   └── db/init.sql               # TimescaleDB schema
├── docs/                         # Architecture diagrams & guides
├── scripts/                      # Utility scripts
├── tests/                        # E2E bash test scripts
└── test/e2e/                     # Playwright E2E tests
```

## Build and Test Commands

### TypeScript (Next.js)

```bash
pnpm install          # Install dependencies
pnpm test             # Run all Vitest tests
pnpm test:watch       # Watch mode
pnpm build            # Production build
pnpm dev              # Dev server with Turbopack (port 3000)
pnpm lint             # ESLint (next/core-web-vitals)
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
FINNHUB_API_KEY       # Required — finnhub.io free tier
FRED_API_KEY          # Required — fred.stlouisfed.org (free, requires registration)
VALYU_API_KEY         # Required — valyu.ai
TIMESCALEDB_PASSWORD  # Default: riskmonitor
DATABASE_URL          # postgresql://risk:riskmonitor@localhost:5432/riskmonitor
# Optional: SENDGRID_API_KEY, SLACK_WEBHOOK_URL (for alert dispatch)
```

See `.env.example` for the full template.

## Key Config Files

| File                                       | Purpose                                                                       |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `services/ingestion/config.yaml`           | Tickers, polling intervals, API keys (env vars), staleness thresholds         |
| `services/correlation/scoring_config.yaml` | Domain weights (0.30/0.20/0.25/0.25), sub-component thresholds, threat levels |
| `services/correlation/alert_config.yaml`   | Alert rules, consecutive readings, cooldowns, channel config                  |
| `docker-compose.yml`                       | Service orchestration, health checks, volumes                                 |
| `services/db/init.sql`                     | TimescaleDB schema (hypertable, indexes, all tables)                          |
| `vitest.config.ts`                         | Vitest test runner (jsdom, globals, setup file)                               |
| `components.json`                          | shadcn/ui component configuration                                            |
| `tailwind.config.ts`                       | Tailwind CSS (dark mode, custom theme)                                        |

## Tech Stack

- **Frontend**: Next.js 15, React 19, TypeScript 5 (strict mode), Tailwind CSS 4, Recharts
- **State**: React Query (@tanstack/react-query), Zustand
- **UI**: shadcn/ui (Radix UI primitives), Lucide icons, Framer Motion
- **AI**: Vercel AI SDK (`ai` package), @ai-sdk/openai, Ollama provider
- **Backend**: pg (node-postgres) for TimescaleDB queries, Zod for validation
- **PDF/Export**: jsPDF, html2canvas, Puppeteer, @sparticuz/chromium
- **Auth**: Supabase (@supabase/ssr, @supabase/supabase-js)
- **Analytics**: PostHog, Vercel Analytics
- **Path alias**: `@/*` maps to `./src/*`

## API Routes

All risk endpoints under `src/app/api/risk/`:

| Endpoint                               | Purpose                                        |
| -------------------------------------- | ---------------------------------------------- |
| `/api/risk/scores`                     | Composite + 4 domain scores with threat levels |
| `/api/risk/correlations?days=N`        | Rolling pairwise correlations (3 pairs)        |
| `/api/risk/health`                     | Source staleness and failure tracking           |
| `/api/risk/timeseries?ticker=X&days=N` | Historical values for charting                 |
| `/api/risk/latest-prices`              | Most recent price per display ticker           |
| `/api/risk/news?domain=X&limit=N`     | Sentiment headlines by domain                  |
| `/api/risk/freshness`                  | Per-ticker data age and status                 |
| `/api/risk/alerts`                     | Alert history (GET) and acknowledgement (POST) |

Additional endpoints: `/api/auth/valyu/*`, `/api/charts/*`, `/api/chat/*`, `/api/csvs/*`, `/api/reports/generate-pdf`, `/api/enterprise/inquiry`, `/api/env-status`, `/api/lmstudio-status`, `/api/ollama-status`.

## Database Schema

Six TimescaleDB tables (defined in `services/db/init.sql`):

| Table              | Purpose                                                     |
| ------------------ | ----------------------------------------------------------- |
| `time_series`      | Hypertable for all market data (ticker, value, source, time)|
| `source_health`    | Per-source last_success, last_error, consecutive_failures   |
| `news_sentiment`   | Domain headlines with sentiment scores                      |
| `insider_trades`   | SEC filing data (ticker, insider, trade_type, shares, price)|
| `alert_state`      | Consecutive count and last_triggered per rule                |
| `alert_history`    | Alert audit trail (rule, channels, delivered status)         |

Computed/synthetic tickers stored in `time_series`: `SCORE_PRIVATE_CREDIT`, `SCORE_AI_CONCENTRATION`, `SCORE_ENERGY_GEO`, `SCORE_CONTAGION`, `SCORE_COMPOSITE`, `SPY_RSP_RATIO`, `BDC_AVG_NAV_DISCOUNT`, `BDC_VOLUME_PROXY`.

## Scoring System

Four domain scorers produce 0-100 scores, combined into a weighted composite:

- **Private Credit** (0.30): HY spread, BDC NAV discount, redemption flow, spread ROC
- **AI Concentration** (0.20): SPY/RSP ratio, SMH relative, top-10 weight proxy
- **Energy/Geo** (0.25): Crude level/volatility, EWT drawdown
- **Contagion** (0.25): Max pairwise correlation, VIX level

Threat levels: LOW (0-25), ELEVATED (26-50), HIGH (51-75), CRITICAL (76-100).

Missing domains are renormalized (weights redistribute). Scorers return `None` (not 0) when data is unavailable. `fetch_latest_value` enforces a 2-hour staleness window via `max_age_hours`. Energy/Geo requires a minimum of 2 sub-components to produce a score.

## Data Source Tiering

Cost optimization — Finnhub (free) handles all high-frequency polling, Valyu (paid) only for low-frequency enrichment:

- **Finnhub**: 16 equity tickers (5min REST) + CL=F, NG=F (WebSocket)
- **FRED**: Credit spreads + Treasury yields (daily, 4 series)
- **Valyu**: SEC filings (daily), news sentiment (hourly, market hours only), insider trading (daily). Budget-constrained (~100 calls/day).

## Testing Patterns

**TypeScript** (Vitest + jsdom, 36+ test files):
- Tests at `src/**/__tests__/*.test.ts(x)` or alongside routes as `route.test.ts`
- API route tests mock `@/lib/timescaledb`
- Component tests use `@/test/query-test-utils.tsx` for React Query wrapper
- Setup file: `vitest.setup.ts`

**Go** (standard `testing`, 21+ test files):
- `httptest.Server` for HTTP mocking
- `testcontainers-go` for integration tests (real TimescaleDB)
- Table-driven tests

**Python** (pytest, 17+ test files):
- Unit tests use pure functions (`score_*_from_values`)
- Integration tests require `DATABASE_URL` pointing to running TimescaleDB
- Skip tags: `integration`, `dispatch_wiring`

**E2E**:
- Playwright tests in `test/e2e/`
- Bash scripts in `tests/` (`e2e-alerting.sh`, `e2e-correlation.sh`, `e2e-dashboard.sh`)

## Code Conventions

- **TypeScript**: Strict mode, path aliases (`@/*`), ESLint with `next/core-web-vitals`
- **Components**: shadcn/ui pattern — primitives in `src/components/ui/`, composed components alongside features
- **Styling**: Tailwind CSS 4 with `class-variance-authority`, `clsx`, `tailwind-merge`
- **API routes**: Next.js App Router handlers (GET/POST exports in `route.ts`)
- **Go**: Standard project layout, packages under `services/ingestion/`
- **Python**: Flat module structure under `services/correlation/`, YAML-driven config

## Known Limitations

- VIX polled as VIXY (ETF proxy) — real VIX unavailable on Finnhub free tier
- MOVE and SKEW indices unavailable — contagion scorer uses 2 of originally planned 4 sub-components
- News sentiment only fetched during US market hours (9:30 AM – 4:00 PM ET)
- Correlation computation requires 30+ trading days of price history to produce values
