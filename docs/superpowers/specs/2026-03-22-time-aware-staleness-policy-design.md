# Time-Aware Staleness Policy

**Issue**: Extends #19 (weekend staleness)
**Date**: 2026-03-22

## Problem

All domain scorers hardcode `max_age_hours=2` in their `fetch_latest_value` calls. During market hours this correctly prevents stale-data scoring. On weekends and holidays, it prevents ALL scoring -- even though Friday's market close data is still the best available information. Three of four domains produce no scores on weekends, leaving the dashboard mostly blank.

## Decision

Replace the hardcoded 2-hour staleness window with a market-hours-aware policy defined in YAML config. During market hours, use a tight window (2h) to catch real outages. During off-hours, relax to 48h so Friday's data produces scores through the weekend. Suppress alert evaluation during off-hours to prevent false alerts from weekend scores.

## Design

### Config

Add a `staleness` block to `scoring_config.yaml` and `scoring_config_yardeni.yaml`:

```yaml
staleness:
  market_hours_max_age: 2 # hours -- tight window during trading
  off_hours_max_age: 48 # hours -- covers full weekend
  market_open: "09:30" # ET
  market_close: "16:00" # ET
  market_days: [0, 1, 2, 3, 4] # Monday=0 through Friday=4
```

If the `staleness` block is missing, fall back to `max_age_hours=2` for backward compatibility.

### Shared utility: `get_staleness_hours(config)`

New function in `services/correlation/scoring/common.py`:

```python
def get_staleness_hours(config: dict[str, Any]) -> float:
```

- Reads `staleness` from config. If missing, returns `2.0`.
- Gets current time in `America/New_York` (via `zoneinfo.ZoneInfo`).
- Checks `market_days` (weekday index, Monday=0) and `market_open`/`market_close` (HH:MM strings parsed to `datetime.time`).
- Returns `market_hours_max_age` if currently within market hours on a market day, otherwise `off_hours_max_age`.

### Scorer changes

Each of the 5 scorer functions currently hardcodes `max_age_hours=2`. Change to accept a `staleness_hours` parameter:

```python
def score_private_credit(db_url, config, ticker_prefix="", staleness_hours=2):
```

All `fetch_latest_value(conn, ticker, max_age_hours=2)` calls become `fetch_latest_value(conn, ticker, max_age_hours=staleness_hours)`.

### run.py changes

In the main loop, compute staleness hours once per cycle and pass to all scorers:

```python
staleness_hours = get_staleness_hours(scoring_config)
```

Update `_run_scoring_pass` to accept and forward `staleness_hours`.

Gate alert evaluation on market hours:

```python
if is_market_hours(scoring_config):
    fired = evaluate_rules(db_url, alert_config)
    # ... dispatch alerts
else:
    logger.info("Off-hours: skipping alert evaluation")
```

Extract `is_market_hours(config)` as a companion to `get_staleness_hours` in `common.py`.

### What does NOT change

- `fetch_latest_value` itself -- no changes to the DB query function
- Dashboard/frontend -- no changes needed
- Database schema -- no changes
- Alert rules or dispatch logic -- only the gate in run.py changes

## Testing

### Unit tests for `get_staleness_hours`

- Weekday 10:00 AM ET returns `market_hours_max_age` (2)
- Weekday 9:29 AM ET returns `off_hours_max_age` (48)
- Weekday 9:30 AM ET returns `market_hours_max_age` (2)
- Weekday 4:00 PM ET returns `off_hours_max_age` (48)
- Saturday 10:00 AM ET returns `off_hours_max_age` (48)
- Sunday 10:00 AM ET returns `off_hours_max_age` (48)
- Config missing `staleness` block returns 2.0 (backward compatibility)

### Unit tests for `is_market_hours`

- Same time-based cases as above, returning True/False

### Unit test for alert suppression

- Verify `evaluate_rules` is not called when `is_market_hours` returns False
- Verify `evaluate_rules` IS called when `is_market_hours` returns True

### Existing tests

- All existing scorer unit tests continue to pass (they use `score_*_from_values` pure functions that don't call `fetch_latest_value`)
- Existing `test_fetch_latest_value` integration tests unaffected (they test the DB function directly)

## Files to create

(none)

## Files to modify

| File                                               | Change                                                |
| -------------------------------------------------- | ----------------------------------------------------- |
| `services/correlation/scoring_config.yaml`         | Add `staleness` block                                 |
| `services/correlation/scoring_config_yardeni.yaml` | Add `staleness` block                                 |
| `services/correlation/scoring/common.py`           | Add `get_staleness_hours()` and `is_market_hours()`   |
| `services/correlation/run.py`                      | Compute staleness hours, pass to scorers, gate alerts |
| `services/correlation/scoring/private_credit.py`   | Accept `staleness_hours` param                        |
| `services/correlation/scoring/ai_concentration.py` | Accept `staleness_hours` param                        |
| `services/correlation/scoring/energy_geo.py`       | Accept `staleness_hours` param                        |
| `services/correlation/scoring/contagion.py`        | Accept `staleness_hours` param                        |
| `services/correlation/scoring/composite.py`        | Accept `staleness_hours` param                        |
| `Dockerfile` (correlation service)                 | No change needed -- `zoneinfo` is in Python stdlib    |

## Assumptions

- `zoneinfo.ZoneInfo("America/New_York")` is available in the correlation service's Python 3.11+ environment (stdlib since 3.9, no extra dependency)
- Market holidays are NOT handled -- only weekday/time checks. A holiday like July 4th on a Wednesday would still use the 2-hour window. This is acceptable because Finnhub returns stale exchange timestamps on holidays just like weekends, so the scorer would produce None for those domains (same as current behavior). A holiday calendar could be added later if needed.
