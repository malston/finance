"""Shared scoring utility functions.

Provides linear_score, inverted_linear_score, composite score computation,
database fetch helpers, and config loading used across all scoring modules.
"""

import logging
from datetime import datetime, time, timezone
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import psycopg2
import yaml

_ET = ZoneInfo("America/New_York")

logger = logging.getLogger(__name__)


def load_scoring_config(config_path: str | None = None) -> dict[str, Any]:
    """Load scoring configuration from YAML file.

    If config_path is not provided, uses scoring_config.yaml in the parent
    directory of this module (services/correlation/).
    """
    if config_path is None:
        config_path = str(Path(__file__).parent.parent / "scoring_config.yaml")
    with open(config_path) as f:
        return yaml.safe_load(f)


def validate_staleness_config(config: dict[str, Any]) -> None:
    """Validate the staleness block in a scoring config.

    Raises ValueError if market_open or market_close cannot be parsed as HH:MM.
    Logs a warning if the staleness block is missing entirely.
    """
    staleness = config.get("staleness")
    if staleness is None:
        logger.warning(
            "No 'staleness' block in config; using defaults "
            "(2h market-hours staleness, no off-hours relaxation)"
        )
        return

    for key in ("market_open", "market_close"):
        value = staleness.get(key)
        if value is None:
            continue
        try:
            parts = str(value).split(":")
            if len(parts) != 2:
                raise ValueError("expected HH:MM")
            h, m = int(parts[0]), int(parts[1])
            time(h, m)
        except (ValueError, IndexError) as exc:
            raise ValueError(
                f"staleness.{key} must be HH:MM format, got {value!r}: {exc}"
            ) from exc


def is_market_hours(config: dict[str, Any], now: datetime | None = None) -> bool:
    """Return True if current time is within US market trading hours.

    Uses the staleness block from config. If missing, returns True (backward compat).
    Market window is [market_open, market_close) -- inclusive open, exclusive close.

    Args:
        config: Scoring config dict with optional top-level 'staleness' block.
        now: Timestamp to evaluate. Defaults to current time if not provided.
    """
    staleness = config.get("staleness")
    if staleness is None:
        return True

    now_et = (now or datetime.now(_ET)).astimezone(_ET)
    market_days = staleness.get("market_days", [0, 1, 2, 3, 4])
    if now_et.weekday() not in market_days:
        return False

    open_str = staleness.get("market_open", "09:30")
    close_str = staleness.get("market_close", "16:00")
    open_h, open_m = (int(x) for x in open_str.split(":"))
    close_h, close_m = (int(x) for x in close_str.split(":"))
    market_open = time(open_h, open_m)
    market_close = time(close_h, close_m)

    return market_open <= now_et.time() < market_close


def get_staleness_hours(config: dict[str, Any], now: datetime | None = None) -> float:
    """Return the appropriate max_age_hours based on current market schedule.

    During market hours, returns the tight window (default 2h).
    During off-hours, returns the relaxed window (default 48h if not configured).
    If config has no staleness block, returns 2.0 for backward compatibility.

    Args:
        config: Scoring config dict with optional top-level 'staleness' block.
        now: Timestamp to evaluate. Defaults to current time if not provided.
    """
    staleness = config.get("staleness")
    if staleness is None:
        return 2.0

    if is_market_hours(config, now=now):
        return float(staleness.get("market_hours_max_age", 2))
    return float(staleness.get("off_hours_max_age", 48))


def linear_score(value: float, low: float, high: float) -> float:
    """Map value to 0-100 between low and high thresholds, clamped."""
    if high == low:
        return 0.0
    raw = (value - low) / (high - low) * 100
    return max(0.0, min(100.0, raw))


def inverted_linear_score(value: float, min_val: float, max_val: float) -> float:
    """Map value on an inverted scale (min > max) to 0-100, clamped.

    For BDC discount: min_val=0 (at NAV, score=0), max_val=-0.20 (20% below, score=100).
    """
    if min_val == max_val:
        return 0.0
    raw = (min_val - value) / (min_val - max_val) * 100
    return max(0.0, min(100.0, raw))


def compute_composite_score(
    sub_scores: dict[str, float],
    config: dict[str, Any],
) -> float | None:
    """Compute weighted average of sub-scores with renormalization for missing components.

    Components not present in sub_scores are excluded and remaining weights renormalized.
    Returns the composite score clamped to 0-100, or None if no components are available
    or if fewer than config["min_components"] sub-scores are present (when configured).
    """
    components = config["components"]
    weighted_sum = 0.0
    total_weight = 0.0
    count = 0

    for name, comp_config in components.items():
        if name in sub_scores:
            weight = comp_config["sub_weight"]
            weighted_sum += sub_scores[name] * weight
            total_weight += weight
            count += 1

    min_components = config.get("min_components")
    if min_components is not None and count < min_components:
        return None

    if total_weight == 0:
        return None

    score = weighted_sum / total_weight
    return round(max(0.0, min(100.0, score)), 2)


def write_score(
    conn: psycopg2.extensions.connection,
    ticker: str,
    score: float,
    data_time: datetime | None = None,
) -> None:
    """Write a computed score to time_series with the given ticker.

    When data_time is provided, the row uses that timestamp instead of now.
    This preserves source data age so the dashboard "as of" display
    reflects when the underlying market data is from, rather than when
    the score was computed.
    """
    ts = data_time or datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, %s, %s, 'computed') "
            "ON CONFLICT (time, ticker) DO UPDATE SET "
            "value = EXCLUDED.value, source = EXCLUDED.source",
            (ts, ticker, score),
        )
    conn.commit()


def fetch_latest_value(
    conn: psycopg2.extensions.connection,
    ticker: str,
    max_age_hours: float | None = None,
) -> float | None:
    """Fetch the most recent value for a ticker from time_series.

    Args:
        conn: Database connection.
        ticker: The ticker symbol to look up.
        max_age_hours: If provided, only consider rows newer than this many
            hours ago. Returns None when all data is older than the cutoff.
    """
    if max_age_hours is not None and max_age_hours <= 0:
        raise ValueError(f"max_age_hours must be positive, got {max_age_hours}")

    if max_age_hours is not None:
        query = (
            "SELECT value FROM time_series "
            "WHERE ticker = %s AND time > NOW() - make_interval(hours => %s) "
            "ORDER BY time DESC LIMIT 1"
        )
        params = (ticker, max_age_hours)
    else:
        query = (
            "SELECT value FROM time_series "
            "WHERE ticker = %s "
            "ORDER BY time DESC LIMIT 1"
        )
        params = (ticker,)

    with conn.cursor() as cur:
        cur.execute(query, params)
        row = cur.fetchone()

    if row:
        return row[0]

    if max_age_hours is not None:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM time_series WHERE ticker = %s LIMIT 1",
                (ticker,),
            )
            exists = cur.fetchone()
        if exists:
            logger.warning(
                "Stale data for %s: exists in DB but older than %s hours",
                ticker, max_age_hours,
            )
        else:
            logger.debug("No data found for %s", ticker)
    return None


def fetch_latest_with_time(
    conn: psycopg2.extensions.connection,
    ticker: str,
    max_age_hours: float | None = None,
) -> tuple[float, datetime] | None:
    """Fetch the most recent value and timestamp for a ticker.

    Like fetch_latest_value but returns (value, timestamp) so callers
    can track the age of the source data they used for scoring.
    """
    if max_age_hours is not None and max_age_hours <= 0:
        raise ValueError(f"max_age_hours must be positive, got {max_age_hours}")

    if max_age_hours is not None:
        query = (
            "SELECT value, time FROM time_series "
            "WHERE ticker = %s AND time > NOW() - make_interval(hours => %s) "
            "ORDER BY time DESC LIMIT 1"
        )
        params = (ticker, max_age_hours)
    else:
        query = (
            "SELECT value, time FROM time_series "
            "WHERE ticker = %s "
            "ORDER BY time DESC LIMIT 1"
        )
        params = (ticker,)

    with conn.cursor() as cur:
        cur.execute(query, params)
        row = cur.fetchone()

    if row:
        return (row[0], row[1])

    if max_age_hours is not None:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM time_series WHERE ticker = %s LIMIT 1",
                (ticker,),
            )
            exists = cur.fetchone()
        if exists:
            logger.warning(
                "Stale data for %s: exists in DB but older than %s hours",
                ticker, max_age_hours,
            )
        else:
            logger.debug("No data found for %s", ticker)
    return None
