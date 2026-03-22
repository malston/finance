# Claude Code Prompt: Bookstaber Risk Monitor

## Context

I'm building a financial systemic risk monitoring dashboard inspired by Richard Bookstaber's NYT opinion piece "I Predicted the 2008 Financial Crisis. What Is Coming May Be Worse" (March 2026). Bookstaber argues that private credit, AI concentration, energy/geopolitical shocks (Iran, Taiwan), and cross-domain contagion are interconnected risks that could cascade through the financial system — not because any single thing fails, but because shocks propagate through a tightly coupled structure faster than they can be contained.

The key insight: when rolling correlations between normally-independent domains (BDC/private credit stocks, big tech equities, and energy futures) start spiking toward 1.0, that's the "contagion signal" — forced selling in illiquid credit markets spilling into publicly traded tech stocks.

## What to Build

A self-hosted financial risk dashboard that tracks four risk domains and computes cross-domain correlation as an early warning system. Fork and adapt the open-source Finance app at `https://github.com/yorkeccak/finance` as the foundation — it provides Valyu API integration for unified financial data, a Next.js 15 + Tailwind + Recharts + shadcn/ui stack, self-hosted mode with local SQLite, and Daytona sandboxed Python execution.

## Architecture

### Tier 1: Data Sources

- **Valyu API** (primary) — unified search for live market data, SEC filings, news sentiment. Already integrated in the Finance app.
- **FRED API** (free) — credit spreads (ICE BofA HY OAS: `BAMLH0A0HYM2`), Treasury yields, macro indicators.
- **Finnhub** (free tier with websocket) — real-time price feeds for tickers that need sub-minute updates (VIX, oil futures during market hours).
- **SEC/EDGAR** — BDC quarterly filings for NAV discount tracking (supplement Valyu's SEC filing search).

### Tier 2: Data Ingestion Service

A Go service (or Python FastAPI if faster to prototype) running on a 5-minute cron:

- Polls all data sources
- Normalizes into a common time series format: `{timestamp, ticker, value, source}`
- Writes to TimescaleDB (or Postgres with time-series extension)
- Handles rate limits, retries, and staleness detection (flag if a source hasn't updated in >15min)

### Tier 3: Storage

- **TimescaleDB** (or regular Postgres) for price time series — hypertables partitioned by day
- **SQLite / Supabase** for app state: alert configs, threshold settings, user preferences
- Retention policy: keep 1-min granularity for 90 days, downsample to daily after that

### Tier 4: Correlation Engine

This is the core analytical component. Runs after each ingestion cycle:

**Rolling Pearson Correlation (30-day window):**

- Compute pairwise correlations between three domain indices:
  - **Private Credit Index**: equal-weighted daily returns of OWL, ARCC, BXSL, OBDC
  - **AI/Tech Index**: equal-weighted daily returns of NVDA, MSFT, GOOGL, META, AMZN
  - **Energy Index**: daily returns of CL=F (crude oil)
- Output three correlation pairs: `credit↔tech`, `credit↔energy`, `tech↔energy`
- Store each as a time series point

**Threat Score Engine:**

- Each of the four domains gets a 0-100 threat score based on configurable rules:
  - **Private Credit Stress (weight: 0.30)**: HY spread level + BDC avg discount to NAV + redemption flow proxy (BDC volume spike) + spread rate of change
  - **AI Concentration (weight: 0.20)**: SPY/RSP ratio deviation from 200-day mean + top-10 weight in S&P 500 + semiconductor ETF relative performance
  - **Energy/Geopolitical (weight: 0.25)**: crude oil level + crude oil 30-day volatility + EWT (Taiwan ETF) drawdown from 52-week high
  - **Cross-Domain Contagion (weight: 0.25)**: max of the three pairwise correlations + VIX level + MOVE index level + VIX-MOVE co-movement
- Composite score = weighted average of the four domain scores
- Thresholds: 0-25 LOW (green), 26-50 ELEVATED (yellow), 51-75 HIGH (orange), 76-100 CRITICAL (red)

### Tier 5: Dashboard (Next.js)

Adapt the Finance app's frontend. Strip the chat interface and replace with a dashboard layout:

**Top section: Composite Threat**

- Large weighted composite score (0-100) with color-coded threat level
- Four individual domain score badges

**Middle section: Correlation Monitor**

- Time series chart (Recharts AreaChart) showing the three pairwise correlations over the last 79 trading days
- Horizontal reference line at ρ=0.5 labeled "CONTAGION THRESHOLD"
- Current correlation value displayed prominently

**Lower section: Four collapsible sector panels**
Each panel shows:

- Domain name, icon, description, threat gauge (arc gauge, 0-100)
- Expandable ticker table with: symbol, name, 79-day sparkline, current price, daily change %
- Alert badges on tickers that have triggered threshold rules

**Tickers per domain:**

Private Credit Stress:

- OWL (Blue Owl Capital)
- ARCC (Ares Capital Corp)
- HYG (iShares High Yield Bond ETF)
- HY Credit Spread (from FRED: BAMLH0A0HYM2) — inverted color (red when rising)

AI / Tech Concentration:

- SPY/RSP ratio (computed: SPY price / RSP price)
- NVDA, MSFT, GOOGL
- SMH (Semiconductor ETF)

Energy & Geopolitical:

- CL=F (WTI Crude Oil)
- NG=F (Natural Gas)
- XLU (Utilities Sector ETF)
- EWT (iShares MSCI Taiwan)

Cross-Domain Contagion:

- CORR (the max pairwise 30-day correlation — computed)
- VIX (CBOE Volatility Index)
- MOVE (Bond Volatility Index)
- SKEW (CBOE Skew Index)

### Tier 6: Alerting

- Configurable alert rules: "if composite threat > 75 for 3 consecutive readings, fire alert"
- Dispatch to: email (SendGrid/SES), Slack webhook, browser push notifications
- Cool-down period to prevent alert storms (default: don't re-fire same alert within 4 hours)

## Tech Stack Decisions

- **Frontend**: Next.js 15, Tailwind CSS, Recharts, shadcn/ui (already in the Finance fork)
- **Backend/Ingestion**: Go preferred (fast, low memory, good for cron-style polling). Python FastAPI acceptable for prototyping.
- **Correlation Math**: Python (numpy/pandas) running in Daytona sandbox OR as a standalone Python module called from the Go service
- **Database**: TimescaleDB for time series, SQLite for app state (matches Finance's self-hosted mode)
- **Deployment**: Docker Compose for local dev (TimescaleDB + Go ingestion + Next.js app). Vercel for the dashboard frontend if desired.

## Implementation Order

1. **Phase 1 — Data pipeline**: Set up the Go ingestion service. Connect Valyu API + FRED API. Write normalized time series to TimescaleDB. Verify data flows for all tickers.
2. **Phase 2 — Correlation engine**: Implement the rolling 30-day Pearson calculation in Python. Wire it to run after each ingestion cycle. Store correlation time series.
3. **Phase 3 — Threat scoring**: Implement the four domain scoring functions with configurable thresholds. Compute composite score.
4. **Phase 4 — Dashboard**: Build the Next.js dashboard UI. Connect to the TimescaleDB read path. Render threat gauges, correlation chart, sector panels with sparklines.
5. **Phase 5 — Alerting**: Add threshold-based alert dispatch.

## Existing Prototype

I have a React prototype (`bookstaber-risk-monitor.jsx`) with the full dashboard UI using simulated data. It includes: composite threat gauge, correlation monitor chart, four collapsible sector panels with sparklines and alert badges, and a threat level color system. Use this as the design reference for the dashboard — the layout, color scheme (dark theme: `#0a0e17` bg, `#111827` panels), typography (IBM Plex Sans + JetBrains Mono), and threat level thresholds are all finalized. The work is to replace the simulated data generators with live data from the pipeline.

## Key Design Constraints

- The dashboard should be usable by someone without a finance background. Jargon should be explained in tooltips or info popovers.
- The correlation chart is the single most important visualization — it should be the first thing you see after the composite score.
- Color means something: green/yellow/orange/red maps to threat levels consistently across all components.
- All threshold values should be configurable via a settings panel or config file, not hardcoded.
- The system should degrade gracefully if a data source is down — show stale data with a warning badge, don't crash.

## Files and References

- Architecture diagram: provided separately (5-tier: Sources → Ingestion → Storage → Correlation Engine → Dashboard → Alerts)
- UI prototype: `bookstaber-risk-monitor.jsx` (React component with simulated data)
- Finance app to fork: `https://github.com/yorkeccak/finance`
- Valyu API docs: `https://docs.valyu.ai`
- FRED API docs: `https://fred.stlouisfed.org/docs/api/fred/`
- Finnhub API docs: `https://finnhub.io/docs/api`
