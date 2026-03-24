# Design Rationale

## Origin

This project implements a systemic risk monitoring thesis from Richard Bookstaber's
March 2026 NYT opinion piece "I Predicted the 2008 Financial Crisis. What Is Coming
May Be Worse." Bookstaber argues that private credit, AI/tech concentration,
energy/geopolitical shocks, and cross-domain contagion are interconnected risks that
could cascade through the financial system -- not because any single thing fails, but
because shocks propagate through a tightly coupled structure faster than they can be
contained.

The key analytical insight: when rolling correlations between normally-independent
domains (private credit, big tech equities, energy futures) spike toward 1.0, forced
selling in illiquid credit markets is spilling into other asset classes. That
cross-domain correlation signal is the core of what this dashboard monitors.

The project was built by forking the open-source Finance app
(https://github.com/yorkeccak/finance) and replacing its chat interface with a
purpose-built risk monitoring dashboard. The scoring pipeline supports dual
interpretive frameworks (Bookstaber systemic risk and Yardeni resilience) with
different weights and threat bands, selected via `?framework=` query parameter.

## Data Source Architecture

The data pipeline uses a tiered approach to minimize cost while maintaining
real-time price feeds:

| Source              | What it provides                                        | Frequency               | Cost                       |
| ------------------- | ------------------------------------------------------- | ----------------------- | -------------------------- |
| Finnhub (free tier) | Equity/ETF prices (REST), commodity futures (WebSocket) | Every 5 min + real-time | $0                         |
| FRED                | Credit spreads, Treasury yields                         | Daily                   | $0 (requires free API key) |
| Valyu API           | SEC filings, news sentiment, insider trading            | Hourly/daily            | ~$10-20/mo                 |

**Why this split matters:** Finnhub's free tier handles all high-frequency price
polling (60 calls/min). Valyu is reserved for what it does best -- search, filings,
and sentiment analysis -- and is never called on the 5-minute price cron. This keeps
the Valyu bill to roughly 100 calls/day. FRED provides credit spread data that
Finnhub's free tier cannot.

## Design Constraints

These constraints shaped architectural decisions throughout the project:

- **Configurable thresholds**: All scoring weights, threat bands, and alert rules
  live in YAML config files, not hardcoded in scoring logic. This allows tuning
  without code changes.

- **Graceful degradation**: When a data source is down, the dashboard shows the last
  known data with staleness indicators rather than crashing. Scorers return `None`
  (not zero) when data is unavailable -- a score of 0 means "no risk" while `None`
  means "unknown."

- **Cost optimization**: Valyu API calls are rate-limited and budgeted. The ingestion
  service tracks daily call counts and warns at 80% of the daily budget.

- **Accessibility**: The dashboard targets individual investors who may not have a
  finance background. Financial jargon has tooltip explanations, and the
  interpretation guide (`interpreting-the-dashboard.md`) provides detailed context.

- **Correlation is primary**: The cross-domain correlation chart is the single most
  important visualization -- positioned immediately after the composite score. Color
  coding (green/yellow/orange/red) maps to threat levels consistently across all
  components.

## External References

- Finnhub API: https://finnhub.io/docs/api
- FRED API: https://fred.stlouisfed.org/docs/api/fred/
- Valyu API: https://docs.valyu.ai
- Valyu pricing: https://docs.valyu.ai/pricing
