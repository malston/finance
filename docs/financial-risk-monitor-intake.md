# Financial Risk Monitor — Paivot Intake Brief

## What is this?

A systemic financial risk monitoring dashboard that tracks four interconnected risk domains and computes cross-domain correlations as an early warning system for cascading financial crises. Built on a fork of the open-source Finance app (<https://github.com/yorkeccak/finance>).

The thesis comes from Richard Bookstaber's March 2026 NYT piece: private credit, AI/tech concentration, energy/geopolitical shocks, and cross-domain contagion are interconnected — a shock to any one can cascade through the others. The key signal is when rolling correlations between normally-independent domains spike, indicating forced selling is propagating across markets.

## Who uses it?

Individual investors and financially-aware technologists who want a persistent monitoring dashboard — not a chat interface — that alerts them when systemic risk indicators are trending dangerously. The user may not have a finance background, so jargon needs tooltips or inline explanation.

## What does it need to do?

### Data Ingestion

Poll financial data from multiple sources on tiered schedules, optimized for cost:

**High-frequency (every 5 minutes during market hours) — free APIs for commodity price data:**

- **Finnhub** (free tier, 60 calls/min) — real-time price feeds for all tracked equities, ETFs, and volatility indices: OWL, ARCC, BXSL, OBDC, NVDA, MSFT, GOOGL, META, AMZN, SMH, SPY, RSP, HYG, XLU, EWT, VIX, MOVE, SKEW
- **Finnhub websocket** — streaming updates for high-priority tickers during market hours: VIX, CL=F, NG=F
- **FRED API** (free with api key) — credit spreads (ICE BofA HY OAS: `BAMLH0A0HYM2`), Treasury yields. FRED updates daily so poll once per day.

**Low-frequency (hourly or daily) — Valyu API for high-value search and analysis:**

- **SEC filing search** — BDC quarterly filings (OWL, ARCC, BXSL, OBDC) for NAV discount tracking, PIK loan disclosures, and portfolio markdowns. Check daily.
- **News sentiment** — scan for breaking news across private credit, AI/tech concentration, energy disruption, and Taiwan/China geopolitical developments. Check hourly during market hours.
- **SEC insider trading** — monitor insider transactions at key BDC and tech companies for early warning signals. Check daily.

This tiered approach keeps the Valyu bill to ~$10-20/month by using it for what it's best at (search, filings, sentiment) while free APIs handle the commodity price polling.

**Data normalization:**

- All sources normalize into a common time series format: `{timestamp, ticker, value, source}`
- Write to TimescaleDB (or Postgres with time-series extension)
- Track data freshness per source — flag stale data with a warning badge if a source hasn't updated in >15min (prices) or >24h (filings)
- Degrade gracefully if any source is down — show last known data with a staleness indicator, don't crash

### Correlation Engine (the core analytical component)

After each price ingestion cycle, compute 30-day rolling Pearson correlations between three domain indices:

- **Private Credit Index**: equal-weighted daily returns of OWL, ARCC, BXSL, OBDC
- **AI/Tech Index**: equal-weighted daily returns of NVDA, MSFT, GOOGL, META, AMZN
- **Energy Index**: daily returns of CL=F (crude oil)

Output three correlation pairs: `credit↔tech`, `credit↔energy`, `tech↔energy`. Store each as a time series point.

### Threat Scoring

Four domains, each scored 0-100 based on configurable rules:

- **Private Credit Stress (weight: 0.30)**: HY spread level + BDC avg discount to NAV + redemption flow proxy (BDC volume spike) + spread rate of change
- **AI Concentration (weight: 0.20)**: SPY/RSP ratio deviation from 200-day mean + top-10 weight in S&P 500 + semiconductor ETF relative performance
- **Energy/Geopolitical (weight: 0.25)**: crude oil level + crude oil 30-day volatility + EWT (Taiwan ETF) drawdown from 52-week high
- **Cross-Domain Contagion (weight: 0.25)**: max of the three pairwise correlations + VIX level + MOVE index level + VIX-MOVE co-movement

Composite score = weighted average of the four domain scores. Thresholds: 0-25 LOW (green), 26-50 ELEVATED (yellow), 51-75 HIGH (orange), 76-100 CRITICAL (red).

### Dashboard UI (replace the Finance app's chat interface)

- **Top**: composite threat score (0-100) with color-coded threat level + four domain score badges
- **Middle**: correlation monitor — time series AreaChart of pairwise correlations over 79 trading days, reference line at ρ=0.5 ("CONTAGION THRESHOLD"), current value displayed prominently
- **Lower**: four collapsible sector panels, each with:
  - Domain name, icon, description, threat gauge (arc gauge, 0-100)
  - Expandable ticker table: symbol, name, 79-day sparkline, current price, daily change %
  - Alert badges on tickers that triggered threshold rules
  - Data freshness indicator per ticker (green dot = live, yellow = stale <1h, red = stale >1h)
- **Sidebar/footer**: Valyu-powered news sentiment feed — latest headlines tagged by domain with sentiment score
- Dark theme: `#0a0e17` bg, `#111827` panels, IBM Plex Sans + JetBrains Mono typography
- I have a React prototype (`bookstaber-risk-monitor.jsx`) in the repo root with the finalized design — use it as the visual reference

### Tickers per Domain

**Private Credit Stress:**

- OWL (Blue Owl Capital), ARCC (Ares Capital Corp), BXSL (Blackstone Secured Lending), OBDC (Blue Owl BDC)
- HYG (iShares High Yield Bond ETF)
- HY Credit Spread (FRED: BAMLH0A0HYM2) — inverted color (red when rising)

**AI / Tech Concentration:**

- SPY/RSP ratio (computed: SPY price / RSP price)
- NVDA, MSFT, GOOGL, META, AMZN
- SMH (Semiconductor ETF)

**Energy & Geopolitical:**

- CL=F (WTI Crude), NG=F (Natural Gas)
- XLU (Utilities ETF), EWT (iShares MSCI Taiwan)

**Cross-Domain Contagion:**

- CORR (max pairwise 30-day correlation — computed)
- VIX (CBOE Volatility Index), MOVE (Bond Volatility Index), SKEW (CBOE Skew Index)

### Alerting

- Configurable rules: e.g. "if composite threat > 75 for 3 consecutive readings, fire alert"
- Dispatch to: email (SendGrid/SES), Slack webhook, browser push
- Cool-down: don't re-fire same alert within 4 hours

## Tech Stack

- **Frontend**: Next.js 15, Tailwind CSS, Recharts, shadcn/ui (already in the Finance fork)
- **Backend/Ingestion**: Go preferred (fast, low memory, good for cron polling). Python FastAPI acceptable for prototype.
- **Correlation Math**: Python (numpy/pandas) in Daytona sandbox OR standalone Python module called from Go service
- **Database**: TimescaleDB for time series, SQLite for app state (matches Finance's self-hosted mode)
- **Deployment**: Docker Compose for local dev (TimescaleDB + Go ingestion + Next.js app)

## Data Source Cost Summary

| Source | What it provides | Frequency | Cost |
|--------|-----------------|-----------|------|
| Finnhub (free tier) | All ticker prices, volumes, websocket streaming | Every 5 min + real-time | $0 |
| FRED | Credit spreads, Treasury yields, macro | Daily | $0 |
| Valyu API | SEC filings, news sentiment, insider trading | Hourly/daily | ~$10-20/mo |
| **Total ongoing** | | | **~$10-20/mo** |

## Constraints

- All threshold values must be configurable (settings panel or config file), not hardcoded
- The correlation chart is the single most important visualization — it should be the first thing visible after the composite score
- Color means something: green/yellow/orange/red maps to threat levels consistently everywhere
- System must degrade gracefully when data sources are unavailable
- Valyu API calls must be rate-limited and budgeted — never poll Valyu on the 5-minute price cron, only on the hourly/daily schedule for search and filings

## Existing Assets in This Repo

- `bookstaber-risk-monitor.jsx` — React prototype with full dashboard UI using simulated data (design reference)
- Full Finance app codebase with Valyu API integration, Next.js 15 structure, self-hosted SQLite mode, Recharts patterns
- `.env.example` with Valyu API key configuration

## Suggested Epic Ordering

1. **Data Pipeline** — Go ingestion service with tiered polling: Finnhub (5-min price cron + websocket), FRED (daily), Valyu (hourly sentiment, daily filings). TimescaleDB writes. Data freshness tracking.
2. **Correlation Engine** — Rolling 30-day Pearson, domain index construction, correlation time series storage
3. **Threat Scoring** — Four domain scoring functions, composite calculation, configurable thresholds
4. **Dashboard** — Next.js dashboard UI replacing chat interface, wired to TimescaleDB read path. Include Valyu-powered news sentiment sidebar.
5. **Alerting** — Threshold-based alert dispatch with cool-down logic

## References

- Architecture diagram: 5-tier (Sources → Ingestion → Storage → Correlation Engine → Dashboard → Alerts)
- Finance app: <https://github.com/yorkeccak/finance>
- Valyu API docs: <https://docs.valyu.ai>
- Valyu pricing: <https://docs.valyu.ai/pricing>
- FRED API docs: <https://fred.stlouisfed.org/docs/api/fred/>
- Finnhub API docs: <https://finnhub.io/docs/api>
