# Financial Risk Monitor — PR Review & Verification

You are reviewing PR #4 on `https://github.com/malston/finance/pull/4` (branch: `integrate/all-stories`). This PR claims to implement the complete Financial Risk Monitor — all 5 epics. Your job is to verify that claim rigorously.

## Reference Documents

Read these files in the repo root before starting:

- `financial-risk-monitor-intake.md` — the original product spec
- `frm-impl-pr.md` — the PR description with acceptance criteria
- `bookstaber-risk-monitor.jsx` — the UI design prototype (simulated data)

## Phase 1: Structural Inventory

Map the codebase against what was specified. For each epic, confirm the files exist and are non-trivial (not stubs or empty placeholders).

**Epic 1 — Data Pipeline (Go ingestion service):**

- [ ] `services/ingestion/` exists with a Go module (`go.mod`)
- [ ] Finnhub client with REST polling (5-min cron for 18 tickers) AND WebSocket streaming (VIX, CL=F, NG=F)
- [ ] FRED client polling credit spreads (`BAMLH0A0HYM2`) and Treasury yields (daily schedule)
- [ ] Valyu client for SEC filings (daily), news sentiment (hourly), insider trading (daily)
- [ ] TimescaleDB writer with `{time, ticker, value, source}` schema
- [ ] Source health tracking with per-source staleness thresholds
- [ ] Scheduler with tiered polling (5-min, hourly, daily)
- [ ] Docker Compose with TimescaleDB, ingestion, correlation, app services
- [ ] Config file (YAML or similar) for API keys, tickers, polling intervals

**Epic 2 — Correlation Engine (Python service):**

- [ ] `services/correlation/` exists with `requirements.txt`
- [ ] Domain index builder: Private Credit (OWL, ARCC, BXSL, OBDC), AI/Tech (NVDA, MSFT, GOOGL, META, AMZN), Energy (CL=F)
- [ ] Rolling 30-day Pearson correlation for 3 pairwise combos: credit↔tech, credit↔energy, tech↔energy
- [ ] Correlation API endpoint with contagion threshold detection (ρ > 0.5)
- [ ] Reads from and writes to TimescaleDB

**Epic 3 — Threat Scoring:**

- [ ] 4 domain scoring functions, each producing 0-100
- [ ] Correct weights: Private Credit 0.30, AI Concentration 0.20, Energy/Geo 0.25, Contagion 0.25
- [ ] Composite weighted score calculation
- [ ] Threat level classification: LOW (0-25), ELEVATED (26-50), HIGH (51-75), CRITICAL (76-100)
- [ ] All thresholds loaded from config (YAML), not hardcoded in scoring logic
- [ ] Missing data renormalization (if a domain has no data, remaining weights redistribute)

**Epic 4 — Dashboard (Next.js):**

- [ ] Dark theme: `#0a0e17` background, `#111827` panels
- [ ] Typography: IBM Plex Sans + JetBrains Mono
- [ ] Composite threat score display with 4 domain badges
- [ ] Correlation monitor AreaChart (Recharts) with ρ=0.5 reference line labeled "CONTAGION THRESHOLD"
- [ ] 4 collapsible sector panels with: SVG threat gauges, sparklines, ticker tables, daily change %
- [ ] Per-ticker data freshness dots (green = live, yellow = stale <1h, red = stale >1h)
- [ ] News sentiment sidebar (Valyu-powered) with domain tabs
- [ ] Jargon tooltips (at least 7 financial terms explained)
- [ ] Threat level legend
- [ ] All 18+ tickers present across the 4 domains matching the spec

**Epic 5 — Alerting:**

- [ ] Configurable threshold-based rules (e.g., "composite > 75 for 3 consecutive readings")
- [ ] Cooldown enforcement (default: no re-fire within 4 hours)
- [ ] Email dispatch (SendGrid)
- [ ] Slack dispatch (Block Kit formatted)
- [ ] Browser push notifications (VAPID)
- [ ] Independent channel failure isolation (one channel failing doesn't block others)

Report any missing items as `MISSING: <description>`. Report partial implementations as `PARTIAL: <description and what's incomplete>`.

## Phase 2: Test Verification

Run every test suite specified in the PR acceptance criteria and report results verbatim.

```bash
# AC1: TypeScript tests (expect 361+ passing across 35 files)
pnpm test

# AC2: Build
pnpm build

# AC3: Go unit tests
cd services/ingestion
go vet ./...
go test -count=1 ./...
cd ../..

# AC5: Python unit tests (skip integration and dispatch_wiring)
cd services/correlation
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -v -k "not integration and not dispatch_wiring"
cd ../..
```

For each test suite, report:

- Total tests run / passed / failed / skipped
- Any test failures with the failure message
- Whether the count matches the PR's claim (e.g., "361+ TypeScript tests")

Do NOT run integration tests (AC4, AC6) or Docker-dependent tests (AC7, AC10) — those require Docker which may not be available. Note them as `SKIPPED: requires Docker`.

## Phase 3: API Contract Verification

Inspect the Next.js API routes and verify all 8 endpoints exist with correct paths:

```
/api/risk/scores
/api/risk/correlations?days=79
/api/risk/health
/api/risk/timeseries?ticker=BAMLH0A0HYM2&days=79
/api/risk/latest-prices
/api/risk/news?domain=private_credit&limit=5
/api/risk/freshness
/api/risk/alerts
```

For each endpoint, confirm:

- The route file exists in the Next.js app directory
- It handles GET requests
- It connects to TimescaleDB or the correlation/scoring service
- It returns JSON
- Error handling exists (doesn't just throw unhandled exceptions)

## Phase 4: Spec Compliance Deep Dive

Cross-reference the implementation against the intake spec (`financial-risk-monitor-intake.md`). Check for:

**Data source tiering (cost optimization):**

- Finnhub handles ALL high-frequency price polling (every 5 min) — verify Valyu is NOT called on the 5-min cron
- Valyu is ONLY called for SEC filings (daily), news sentiment (hourly), and insider trading (daily)
- FRED is polled daily for credit spreads

**Correlation math correctness:**

- Verify the Pearson correlation implementation uses daily returns (not raw prices)
- Verify the rolling window is 30 trading days
- Verify all 3 pairwise combinations are computed
- Check that the domain indices are equal-weighted (not market-cap weighted)

**Threat scoring weights:**

- Private Credit: 0.30
- AI Concentration: 0.20
- Energy/Geo: 0.25
- Contagion: 0.25
- Verify weights sum to 1.0
- Verify the composite is a weighted average, not a simple average

**Dashboard completeness vs prototype:**

- Compare the implemented dashboard against `bookstaber-risk-monitor.jsx`
- Note any visual elements present in the prototype but missing from the implementation
- Note any additions not in the prototype

**Ticker coverage:**
Verify every ticker from the spec is present in the ingestion config AND the dashboard:

- Private Credit: OWL, ARCC, BXSL, OBDC, HYG, BAMLH0A0HYM2
- AI/Tech: SPY, RSP (for ratio), NVDA, MSFT, GOOGL, META, AMZN, SMH
- Energy/Geo: CL=F, NG=F, XLU, EWT
- Contagion: VIX, MOVE, SKEW (plus computed CORR)

**Graceful degradation:**

- What happens when Finnhub is unreachable? Does the dashboard show stale data with a warning, or crash?
- What happens when TimescaleDB has no data yet? Do API endpoints return empty arrays/nulls or 500 errors?
- Is there staleness detection with the specified thresholds (>15min for prices, >24h for filings)?

## Phase 5: Code Quality Review

Review the actual code quality, not just "does it exist":

**Go ingestion service:**

- Are API clients properly handling rate limits and retries?
- Is there graceful shutdown handling?
- Are secrets loaded from environment variables (not hardcoded)?
- Is error handling idiomatic Go (no swallowed errors)?
- Are there meaningful unit tests (not just "test that the function exists")?

**Python correlation service:**

- Are numpy/pandas operations vectorized (not Python loops over price data)?
- Is the Pearson calculation numerically stable for edge cases (e.g., zero variance)?
- Are division-by-zero and NaN cases handled in scoring?
- Is the YAML config loading validated (what happens with missing keys)?

**Next.js dashboard:**

- Are API calls from the frontend using SWR, React Query, or similar for caching/revalidation?
- Is there loading state handling (skeleton screens or spinners while data loads)?
- Are the Recharts components using responsive containers?
- Is there mobile responsiveness (the spec mentions news sidebar is "desktop only, hidden on mobile")?

**Docker Compose:**

- Does TimescaleDB have a health check?
- Do the ingestion and correlation services wait for TimescaleDB to be healthy before starting?
- Are volumes configured for data persistence?
- Are environment variables passed correctly from `.env`?

## Output Format

Produce a structured report with these sections:

```
## 1. Structural Inventory
[checklist results]

## 2. Test Results
[verbatim test output summaries]

## 3. API Contract
[endpoint verification]

## 4. Spec Compliance
[detailed findings, any gaps]

## 5. Code Quality
[observations, concerns, recommendations]

## 6. Verdict
PASS — all epics complete, tests passing, spec compliance verified
PASS WITH NOTES — complete but with issues that should be addressed before merge
FAIL — missing functionality, broken tests, or spec violations that block merge

[summary of blockers if FAIL, or notes if PASS WITH NOTES]
```
