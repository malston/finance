"""Shared scoring utility functions.

Provides linear_score, inverted_linear_score, composite score computation,
database fetch helpers, and config loading used across all scoring modules.
"""

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2
import yaml

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
    Returns the composite score clamped to 0-100, or None if no components are available.
    """
    components = config["components"]
    weighted_sum = 0.0
    total_weight = 0.0

    for name, comp_config in components.items():
        if name in sub_scores:
            weight = comp_config["sub_weight"]
            weighted_sum += sub_scores[name] * weight
            total_weight += weight

    if total_weight == 0:
        return None

    score = weighted_sum / total_weight
    return round(max(0.0, min(100.0, score)), 2)


def write_score(
    conn: psycopg2.extensions.connection,
    ticker: str,
    score: float,
) -> None:
    """Write a computed score to time_series with the given ticker."""
    now = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, %s, %s, 'computed') "
            "ON CONFLICT (time, ticker) DO UPDATE SET "
            "value = EXCLUDED.value, source = EXCLUDED.source",
            (now, ticker, score),
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
    if max_age_hours is not None:
        query = (
            "SELECT value FROM time_series "
            "WHERE ticker = %s AND time > NOW() - INTERVAL '%s hours' "
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
    return row[0] if row else None
