"""Private Credit Stress scoring function.

Computes a 0-100 stress score from HY spread levels, BDC NAV discounts,
redemption flow proxy, and spread rate of change. Reads inputs from
TimescaleDB and writes the result back as SCORE_PRIVATE_CREDIT.
"""

import logging
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

import psycopg2
import yaml

logger = logging.getLogger(__name__)


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


def _compute_composite_score(
    sub_scores: dict[str, float],
    config: dict[str, Any],
) -> float:
    """Compute weighted average of sub-scores with renormalization for missing components.

    sub_scores maps component names (hy_spread, bdc_discount, etc.) to their 0-100 scores.
    Components not present in sub_scores are excluded and remaining weights renormalized.

    Returns the composite score clamped to 0-100.
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
        return 0.0

    score = weighted_sum / total_weight
    return round(max(0.0, min(100.0, score)), 2)


def _fetch_latest_value(
    conn: psycopg2.extensions.connection,
    ticker: str,
) -> float | None:
    """Fetch the most recent value for a ticker from time_series."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT value FROM time_series "
            "WHERE ticker = %s "
            "ORDER BY time DESC LIMIT 1",
            (ticker,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def _fetch_value_days_ago(
    conn: psycopg2.extensions.connection,
    ticker: str,
    days: int,
) -> float | None:
    """Fetch the value closest to N days ago for a ticker."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT value FROM time_series "
            "WHERE ticker = %s AND time <= %s "
            "ORDER BY time DESC LIMIT 1",
            (ticker, cutoff),
        )
        row = cur.fetchone()
    return row[0] if row else None


def _write_score(
    conn: psycopg2.extensions.connection,
    score: float,
) -> None:
    """Write the computed score to time_series as SCORE_PRIVATE_CREDIT."""
    now = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, 'SCORE_PRIVATE_CREDIT', %s, 'computed') "
            "ON CONFLICT (time, ticker) DO UPDATE SET "
            "value = EXCLUDED.value, source = EXCLUDED.source",
            (now, score),
        )
    conn.commit()


def load_scoring_config(config_path: str | None = None) -> dict[str, Any]:
    """Load scoring configuration from YAML file.

    If config_path is not provided, uses scoring_config.yaml in the parent
    directory of this module (services/correlation/).
    """
    if config_path is None:
        config_path = str(Path(__file__).parent.parent / "scoring_config.yaml")
    with open(config_path) as f:
        return yaml.safe_load(f)


def score_private_credit(db_url: str, config: dict[str, Any]) -> float:
    """Compute Private Credit Stress score and write it to TimescaleDB.

    Reads current market data from the time_series table, computes 4
    sub-component scores using configurable thresholds, writes the result
    back to time_series as SCORE_PRIVATE_CREDIT, and returns the score.

    Args:
        db_url: PostgreSQL/TimescaleDB connection string.
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed score (0-100).
    """
    pc_config = config["scoring"]["private_credit"]
    components = pc_config["components"]
    sub_scores: dict[str, float] = {}

    conn = psycopg2.connect(db_url)
    try:
        # HY Spread level
        hy_config = components["hy_spread"]
        hy_value = _fetch_latest_value(conn, hy_config["ticker"])
        if hy_value is not None:
            sub_scores["hy_spread"] = linear_score(
                hy_value, hy_config["min_value"], hy_config["max_value"],
            )

        # BDC NAV discount (inverted scale)
        bdc_config = components["bdc_discount"]
        bdc_value = _fetch_latest_value(conn, bdc_config["ticker"])
        if bdc_value is not None:
            sub_scores["bdc_discount"] = inverted_linear_score(
                bdc_value, bdc_config["min_value"], bdc_config["max_value"],
            )

        # Redemption flow proxy (placeholder until volume data available)
        rf_config = components["redemption_flow"]
        sub_scores["redemption_flow"] = rf_config["placeholder"]

        # Spread rate of change
        roc_config = components["spread_roc"]
        lookback = roc_config.get("lookback_days", 5)
        current_spread = hy_value  # reuse from above
        past_spread = _fetch_value_days_ago(conn, roc_config["ticker"], lookback)
        if current_spread is not None and past_spread is not None:
            roc = current_spread - past_spread
            sub_scores["spread_roc"] = linear_score(
                roc, roc_config["min_value"], roc_config["max_value"],
            )

        score = _compute_composite_score(sub_scores, pc_config)

        _write_score(conn, score)
    finally:
        conn.close()

    return score
