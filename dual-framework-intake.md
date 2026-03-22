# Dual Interpretive Framework Toggle — Paivot Intake Brief

## What is this?

A feature that lets the user toggle between two competing interpretive frameworks — Bookstaber (Systemic Risk) and Yardeni (Resilience) — on the same underlying data. The correlation engine, data pipeline, and ticker coverage remain identical. What changes is the scoring thresholds, the threat level bands, the composite weights, and the narrative layer (tooltips, explainer text, sidebar emphasis).

This is not a cosmetic skin swap. It's two fundamentally different risk philosophies applied to the same market data, producing different composite scores, different threat levels, and different implications for the same set of facts.

## Why does this matter?

The hardest problem in risk monitoring isn't getting the data right — it's interpreting it. Bookstaber and Yardeni look at the same cross-domain correlation spike and reach opposite conclusions. Bookstaber: "forced selling is cascading across markets — the system is failing." Yardeni: "sector rotation in progress — distressed funds are circling, buying opportunity incoming." Having both frameworks side-by-side forces the user to think critically about which regime we're actually in rather than anchoring on one narrative.

## Who uses it?

Same user persona as the main dashboard. The toggle is especially valuable for users who follow both risk analysts and optimistic market commentators and want to see how the same data supports different conclusions.

## What does it need to do?

### Scoring Config

**Files:**
- `scoring_config.yaml` — existing Bookstaber framework (no changes)
- `scoring_config_yardeni.yaml` — new file with adjusted thresholds (already drafted, in repo root)

**Key differences in Yardeni config:**
- Private credit weight reduced from 0.30 to 0.25 (retail panic ≠ systemic crisis)
- Energy/geo weight increased from 0.25 to 0.30 (Yardeni takes geopolitics seriously but sees self-correction)
- HY spread floor raised from 300 to 350 bps (350 is normal in Yardeni's world)
- BDC discount max widened from -0.20 to -0.25 (more room before alarm)
- Correlation max_value raised from 0.70 to 0.85 (doesn't panic until extreme levels)
- VIX floor raised from 15 to 18, ceiling raised from 40 to 50
- Crude oil floor raised from $30 to $50 (US energy independence blunts transmission)
- Threat level bands shifted: LOW 0-30, ELEVATED 31-55, HIGH 56-80, CRITICAL 81-100 (vs Bookstaber's 0-25, 26-50, 51-75, 76-100)

### API Changes

**Parameterize the scoring config path in the correlation service:**

`run.py` currently calls `load_scoring_config()` which defaults to `scoring_config.yaml`. Add a `SCORING_FRAMEWORK` environment variable (default: `bookstaber`) that selects the config file:
- `bookstaber` → `scoring_config.yaml`
- `yardeni` → `scoring_config_yardeni.yaml`

However, for the frontend toggle to work without restarting the correlation service, the API routes need to support both frameworks simultaneously. Two approaches (Architect should pick one):

**Option A — Dual score tickers:** The correlation service computes and writes scores for both frameworks on every cycle. Bookstaber scores use existing tickers (`SCORE_PRIVATE_CREDIT`, `SCORE_COMPOSITE`, etc.). Yardeni scores use prefixed tickers (`YARDENI_SCORE_PRIVATE_CREDIT`, `YARDENI_SCORE_COMPOSITE`, etc.). The API routes accept a `?framework=yardeni` parameter and query the appropriate ticker prefix. Doubles the scoring compute but is the simplest approach.

**Option B — On-demand rescoring:** The correlation service only computes Bookstaber scores (default). When the API receives `?framework=yardeni`, it loads the Yardeni config, pulls the same underlying data (latest VIX, correlations, spreads), and computes the Yardeni scores on-the-fly. No extra tickers in TimescaleDB but adds latency to API responses.

**Recommendation:** Option A. The scoring compute is trivial (sub-millisecond per domain). Doubling it on the 5-minute cycle costs nothing meaningful, and it means the API is always a simple read with zero compute latency. Keep it boring.

**Affected API routes:**

All routes under `/api/risk/` that return scores or threat levels need the `?framework=` parameter:
- `GET /api/risk/scores?framework=yardeni` — returns Yardeni-weighted composite and domain scores
- `GET /api/risk/correlations?days=79&framework=yardeni` — same correlation data, but `max_current.above_threshold` uses Yardeni's threshold (0.85 vs 0.5)

Routes that return raw data (timeseries, latest-prices, freshness, health) are framework-agnostic and don't change.

### Frontend Changes

**Framework selector:** Add a toggle to the dashboard header, next to the clock. Two options:
- "Bookstaber — Systemic Risk" (default)
- "Yardeni — Resilience"

Visual treatment: a segmented control or pill toggle. When Bookstaber is active, the toggle accent uses the existing threat color scheme. When Yardeni is active, use a blue/teal accent to visually distinguish the "optimistic" framing.

**State management:** Store the active framework in React state. When toggled, re-fetch `/api/risk/scores` and `/api/risk/correlations` with the new `?framework=` param. All other data (sparklines, ticker prices, news) stays unchanged.

**Composite threat display:** The composite score number, threat level label, threat level color, and domain badges all update based on the selected framework. The header subtitle should change:
- Bookstaber: "Systemic contagion tracker — Private Credit × AI × Energy × Geopolitical"
- Yardeni: "Resilience monitor — tracking self-correction across risk domains"

**Correlation chart:** The ρ=0.5 contagion threshold reference line shifts to ρ=0.85 when Yardeni is selected. The label changes from "CONTAGION THRESHOLD" to "EXTREME CORRELATION". The chart data itself is identical.

**Sector panel threat gauges:** The arc gauge colors and threat level labels update based on the active framework's `threat_levels` config. The gauges will show lower scores under Yardeni for the same data.

**Jargon tooltips — framework-aware explanations (7+ terms):**

Each financial term gets two tooltip variants. Examples:

| Term | Bookstaber tooltip | Yardeni tooltip |
|------|-------------------|-----------------|
| Cross-domain correlation | "When normally independent markets start moving in lockstep, it signals forced selling is propagating — the contagion Bookstaber warns about." | "Correlation spikes during selloffs are normal and historically revert. The question is whether distressed buyers step in — they usually do." |
| HY credit spread | "Widening spreads mean lenders are demanding higher returns for risk — a sign that credit stress is building." | "Spreads widen and narrow cyclically. Current levels are elevated but within the range the economy has absorbed before." |
| BDC NAV discount | "BDCs trading below their net asset value means the market believes the loans on their books are worth less than reported." | "Retail investors panic-selling BDC shares below NAV creates buying opportunities for institutional distressed funds." |
| VIX | "The fear gauge. Elevated VIX means options traders are pricing in larger expected moves — uncertainty is high." | "VIX spikes are transient. Markets have learned that geopolitical crises create buying opportunities. Elevated VIX is the setup, not the punchline." |
| Composite threat score | "A weighted average of four risk domains. Above 75 means multiple domains are simultaneously stressed — the cascade risk Bookstaber describes." | "A weighted resilience reading. Even at elevated levels, the historical pattern is mean reversion. The economy has absorbed worse." |
| SPY/RSP ratio | "Measures how much the market depends on a handful of mega-cap stocks. Higher ratio = more fragile concentration." | "Concentration reflects where growth is. The top 10 stocks are the AI/productivity winners — concentration is the feature, not the bug." |
| Crude oil volatility | "Energy price instability directly impacts AI data center costs and the broader economy through inflation." | "Oil spikes are called spikes for a reason — they're transient. US energy independence means the transmission to the real economy is weaker than in the 1970s." |

**News sentiment sidebar — framework-aware weighting:**

When Bookstaber is active, the sidebar prioritizes negative-sentiment headlines (stress, defaults, escalation). When Yardeni is active, it prioritizes resilience headlines (earnings beats, consumer spending, productivity gains) and surfaces "buying opportunity" framing for the same events. Both show the same underlying data — just sorted and weighted differently.

Implementation: add a `?framework=` param to `GET /api/risk/news` that adjusts the sort order. Bookstaber sorts by most-negative sentiment first. Yardeni sorts by most-positive first, or surfaces headlines containing resilience keywords.

### Threat level legend

The legend at the bottom of the dashboard should update its bands to match the active framework:
- Bookstaber: LOW (0-25), ELEVATED (26-50), HIGH (51-75), CRITICAL (76-100)
- Yardeni: LOW (0-30), ELEVATED (31-55), HIGH (56-80), CRITICAL (81-100)

## Constraints

- The data pipeline, correlation engine, and ticker coverage must NOT change between frameworks. Same 18 tickers, same 30-day rolling Pearson, same TimescaleDB schema.
- Framework selection must persist across page refreshes (localStorage or URL param).
- The toggle must be instant — no loading spinner. If using Option A (dual tickers), both score sets are always pre-computed and the switch is a simple re-read.
- Both framework configs must be version-controlled YAML, not hardcoded in TypeScript.
- When a new framework is added in the future (and people will ask), the architecture should make it trivial: drop a new `scoring_config_<name>.yaml`, add a ticker prefix, add a frontend option.

## Existing Assets

- `scoring_config.yaml` — current Bookstaber config (no changes needed)
- `scoring_config_yardeni.yaml` — Yardeni config (in repo root, ready to move to `services/correlation/`)
- `bookstaber-risk-monitor.jsx` — UI prototype (shows current Bookstaber-only layout)
- All correlation engine scoring functions already load config via `load_scoring_config(config_path)` — parameterization is straightforward

## Suggested Story Breakdown

1. **Yardeni scoring config + dual ticker computation** — Move `scoring_config_yardeni.yaml` into `services/correlation/`. Update `run.py` to compute both Bookstaber and Yardeni scores on each cycle, writing Yardeni scores with `YARDENI_` ticker prefix. Unit tests for Yardeni thresholds.
2. **API framework parameter** — Add `?framework=` query param to `/api/risk/scores` and `/api/risk/correlations`. Default to `bookstaber`. When `yardeni`, query `YARDENI_` prefixed tickers and use Yardeni threshold for `above_threshold`.
3. **Frontend framework toggle** — Header pill toggle. Re-fetches scores and correlations on switch. Updates composite display, gauge colors, correlation threshold line, threat level legend. Persists selection in localStorage.
4. **Framework-aware tooltips and narrative** — Two tooltip variants per term (7+ terms). Sidebar news sort order switches. Header subtitle updates.
