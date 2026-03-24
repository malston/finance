# Design Rationale

## Origin

This project monitors four interconnected financial risk domains -- Private Credit,
AI/Tech Concentration, Energy & Geopolitical, and Cross-Domain Contagion -- through
two competing interpretive frameworks applied to the same market data.

The initial thesis came from Richard Bookstaber's March 2026 NYT opinion piece
"I Predicted the 2008 Financial Crisis. What Is Coming May Be Worse." Bookstaber
argues that these risk domains are tightly coupled and that shocks cascade through
forced selling faster than they can be contained. When rolling correlations between
normally-independent domains spike, it signals contagion -- the core warning signal
this dashboard monitors.

The counterpoint comes from Ed Yardeni's resilience-oriented market philosophy.
Yardeni looks at the same data and sees self-correcting mechanisms: distressed buyers
stepping in, sector rotation absorbing shocks, and an economy with structural
capacity to absorb elevated stress. The same correlation spike that Bookstaber reads
as cascading failure, Yardeni reads as a transient dislocation.

Both frameworks score the same tickers with different weights and threat bands. The
scoring pipeline runs both on every 5-minute cycle, and the dashboard toggle lets
users see how different risk philosophies interpret identical market conditions.

The project was built by forking the open-source Finance app
(https://github.com/yorkeccak/finance) and replacing its chat interface with a
purpose-built risk monitoring dashboard.

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
