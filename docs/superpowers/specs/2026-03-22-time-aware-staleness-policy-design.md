# Time-Aware Staleness Policy

**Issue**: Extends #19 (weekend staleness)
**Date**: 2026-03-22

## Problem

All domain scorers hardcode `max_age_hours=2` in their `fetch_latest_value` calls. During market hours this correctly prevents stale-data scoring. On weekends and holidays, it prevents ALL scoring -- even though Friday's market close data is still the best available information. Three of four domains produce no scores on weekends, leaving the dashboard mostly blank.

## Decision

Replace the hardcoded 2-hour staleness window with a market-hours-aware policy defined in YAML config. During market hours, use a tight window (2h) to catch real outages. During off-hours, relax to 48h so Friday's data produces scores through the weekend. Suppress alert evaluation during off-hours to prevent false alerts from weekend scores.

Score rows written during off-hours carry the source data's timestamp (not the current wall clock), so the dashboard's "as of" staleness display accurately reflects when the underlying market data is from.

## Design

### Config

Add a `staleness` block to `scoring_config.yaml` and `scoring_config_yardeni.yaml`:

```yaml
staleness:
  market_hours_max_age: 2 # hours -- tight window during trading
  off_hours_max_age: 48 # hours -- covers full weekend
  market_open: "09:30" # ET
  market_close: "16:00" # ET
  market_days: [0, 1, 2, 3, 4] # Monday=0 (datetime.weekday()) through Friday=4
```

If the `staleness` block is missing, fall back to `max_age_hours=2` for backward compatibility.

The `off_hours_max_age` of 48h covers a standard weekend. For 3-day weekends (Monday holidays), the operator can increase this value to 72h via config. The spec deliberately does not handle market holidays -- on a holiday Wednesday, the 2-hour market-hours window applies, Finnhub returns stale exchange timestamps, and scorers produce None (same as current behavior).

### Market hours detection

Two new functions in `services/correlation/scoring/common.py`:

```python
def is_market_hours(config: dict[str, Any]) -> bool:
def get_staleness_hours(config: dict[str, Any]) -> float:
```

- Read `staleness` from config. If missing, `is_market_hours` returns True and `get_staleness_hours` returns `2.0`.
- Get current time in `America/New_York` via `zoneinfo.ZoneInfo`.
- Check `market_days` using `datetime.weekday()` (Monday=0, Sunday=6) and `market_open`/`market_close` parsed as `datetime.time`.
- Market window is `[market_open, market_close)` -- inclusive open, exclusive close. At 4:00 PM ET, the closing bell has rung, so this is off-hours.
- `get_staleness_hours` returns `market_hours_max_age` during market hours, `off_hours_max_age` otherwise.

### Score timestamp: source data age

`write_score` currently uses `datetime.now(timezone.utc)` as the row timestamp. This means weekend scores look "fresh" even though they're computed from Friday's data. The dashboard's "as of" display (from PR #21) would never trigger on weekends.

**Fix:** Add an optional `data_time` parameter to `write_score`. When provided, use it as the row timestamp instead of now.

```python
def write_score(conn, ticker, score, data_time=None):
    ts = data_time or datetime.now(timezone.utc)
    ...
```

Each scorer needs to track the oldest source data timestamp it used. Add a `fetch_latest_with_time` function (or modify `fetch_latest_value` to optionally return the timestamp):

```python
def fetch_latest_with_time(conn, ticker, max_age_hours=None) -> tuple[float, datetime] | None:
```

Returns `(value, timestamp)` or `None`. Scorers collect timestamps from each `fetch_latest_with_time` call and pass `min(timestamps)` to `write_score` as `data_time`.

During market hours, `data_time` will be essentially "now" (within the 2-hour window). During off-hours, it will be Friday's close timestamp. The dashboard "as of" display then accurately shows "as of Fri, Mar 20 4:00 PM ET" on weekends.

### Scorer changes

Each of the 5 scorer functions changes:

1. Accept `staleness_hours` parameter (default `2`)
2. Use `fetch_latest_with_time` instead of `fetch_latest_value`
3. Track the min timestamp across all fetched values
4. Pass `data_time=min_timestamp` to `write_score`

The `_fetch_value_days_ago` (private_credit.py) and `_fetch_daily_values` (energy_geo.py) lookback functions are intentionally unchanged -- they fetch historical windows for rate-of-change and volatility calculations, not "latest" values.

### run.py changes

Compute staleness hours once per cycle (before `_run_scoring_pass`):

```python
staleness_hours = get_staleness_hours(scoring_config)
logger.info("Staleness policy: %sh (%s)", staleness_hours,
            "market hours" if is_market_hours(scoring_config) else "off-hours")
```

Update `_run_scoring_pass` to accept and forward `staleness_hours`.

Gate alert evaluation on market hours:

```python
if is_market_hours(scoring_config):
    fired = evaluate_rules(db_url, alert_config)
    ...
else:
    logger.info("Off-hours: skipping alert evaluation")
```

The `is_market_hours` check uses the Bookstaber config's staleness block. Both frameworks share the same market schedule, and alert evaluation is framework-independent.

### What does NOT change

- `fetch_latest_value` itself -- kept for backward compatibility, callers that don't need timestamps continue using it
- Dashboard/frontend -- no changes needed (the "as of" display from PR #21 works correctly with source-timestamped scores)
- Database schema -- no changes
- Alert rules or dispatch logic -- only the gate in run.py changes
- `_fetch_value_days_ago`, `_fetch_daily_values` -- intentionally use lookback windows, not subject to staleness

## Testing

### Unit tests for `get_staleness_hours` and `is_market_hours`

Use `unittest.mock.patch` to freeze `datetime.now` for deterministic tests:

- Weekday 10:00 AM ET: `is_market_hours` True, `get_staleness_hours` returns 2
- Weekday 9:29 AM ET: `is_market_hours` False, returns 48
- Weekday 9:30 AM ET: `is_market_hours` True, returns 2 (inclusive open)
- Weekday 4:00 PM ET: `is_market_hours` False, returns 48 (exclusive close)
- Saturday 10:00 AM ET: `is_market_hours` False, returns 48
- Sunday 3:00 PM ET: `is_market_hours` False, returns 48
- Config missing `staleness` block: `is_market_hours` True, returns 2.0
- Config with `staleness` but missing `market_hours_max_age`: returns 2.0 (safe fallback for each sub-key)

### Unit tests for `fetch_latest_with_time`

- Returns `(value, timestamp)` tuple when data exists within window
- Returns `None` when data is stale
- Returns `None` when no data exists

### Unit tests for `write_score` with `data_time`

- When `data_time` is provided, the row uses that timestamp
- When `data_time` is None, the row uses current time (existing behavior)

### Unit test for alert suppression in run.py

- Mock `is_market_hours` to return False, verify `evaluate_rules` is not called
- Mock `is_market_hours` to return True, verify `evaluate_rules` IS called

### Unit test for `_run_scoring_pass` forwarding

- Mock a scorer, verify `staleness_hours` kwarg is passed through

### Existing tests

- `test_dual_ticker_scoring.py`: existing tests call scorers without `staleness_hours`. Since it defaults to `2`, these tests continue to pass without changes. Verify this explicitly.
- `test_fetch_latest_value.py`: tests the DB function directly, unaffected
- `score_*_from_values` unit tests: test pure scoring math, unaffected

## Files to create

(none)

## Files to modify

| File                                               | Change                                                                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `services/correlation/scoring_config.yaml`         | Add `staleness` block                                                                                                |
| `services/correlation/scoring_config_yardeni.yaml` | Add `staleness` block                                                                                                |
| `services/correlation/scoring/common.py`           | Add `get_staleness_hours()`, `is_market_hours()`, `fetch_latest_with_time()`, add `data_time` param to `write_score` |
| `services/correlation/run.py`                      | Compute staleness hours, pass to scorers, gate alerts                                                                |
| `services/correlation/scoring/private_credit.py`   | Accept `staleness_hours`, use `fetch_latest_with_time`, pass `data_time` to `write_score`                            |
| `services/correlation/scoring/ai_concentration.py` | Same                                                                                                                 |
| `services/correlation/scoring/energy_geo.py`       | Same                                                                                                                 |
| `services/correlation/scoring/contagion.py`        | Same                                                                                                                 |
| `services/correlation/scoring/composite.py`        | Same                                                                                                                 |
| `CLAUDE.md`                                        | Update staleness documentation in Scoring Safety and Weekend/Holiday sections                                        |

## Assumptions

- `zoneinfo.ZoneInfo("America/New_York")` is available in the correlation service's Python 3.11+ environment (stdlib since 3.9)
- Market holidays are NOT handled -- only weekday/time checks. A holiday calendar could be added later if needed.
- The staleness value is computed once at the start of each scoring cycle. If the cycle starts at 9:29 AM and scorers run at 9:31 AM, the off-hours staleness value (48h) is used for that cycle. This is acceptable because the data itself hasn't changed in those 2 minutes.
- Both frameworks (Bookstaber/Yardeni) share the same market schedule. Alert evaluation uses the Bookstaber config for the market-hours check.
