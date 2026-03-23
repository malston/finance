"""Private Credit Stress scoring function.

Computes a 0-100 stress score from HY spread levels, BDC NAV discounts,
redemption flow proxy, and spread rate of change. Reads inputs from
TimescaleDB and writes the result back with an optional ticker prefix.
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Any

import psycopg2

from scoring.common import (
    compute_composite_score,
    fetch_latest_with_time,
    inverted_linear_score,
    linear_score,
    write_score,
)

logger = logging.getLogger(__name__)


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


def score_private_credit(
    db_url: str,
    config: dict[str, Any],
    ticker_prefix: str = "",
    staleness_hours: float = 2,
) -> float | None:
    """Compute Private Credit Stress score and write it to TimescaleDB.

    Reads current market data from the time_series table, computes 4
    sub-component scores using configurable thresholds, writes the result
    back to time_series as {ticker_prefix}SCORE_PRIVATE_CREDIT, and returns
    the score.

    Args:
        db_url: PostgreSQL/TimescaleDB connection string.
        config: Full scoring config dict (with top-level 'scoring' key).
        ticker_prefix: Prepended to the output ticker name (default: "").
        staleness_hours: Maximum age of source data in hours (default: 2).

    Returns:
        The computed score (0-100).
    """
    pc_config = config.get("scoring", {}).get("private_credit", {})
    components = pc_config.get("components", {})
    sub_scores: dict[str, float] = {}
    timestamps: list[datetime] = []

    conn = psycopg2.connect(db_url)
    try:
        # HY Spread level
        hy_config = components.get("hy_spread", {})
        hy_result = fetch_latest_with_time(conn, hy_config.get("ticker", "BAMLH0A0HYM2"), max_age_hours=staleness_hours)
        if hy_result is not None:
            hy_value, hy_time = hy_result
            timestamps.append(hy_time)
            sub_scores["hy_spread"] = linear_score(
                hy_value, hy_config.get("min_value", 300), hy_config.get("max_value", 800),
            )
        else:
            hy_value = None

        # BDC NAV discount (inverted scale)
        bdc_config = components.get("bdc_discount", {})
        bdc_result = fetch_latest_with_time(conn, bdc_config.get("ticker", "BDC_AVG_NAV_DISCOUNT"), max_age_hours=staleness_hours)
        if bdc_result is not None:
            bdc_value, bdc_time = bdc_result
            timestamps.append(bdc_time)
            sub_scores["bdc_discount"] = inverted_linear_score(
                bdc_value, bdc_config.get("min_value", 0), bdc_config.get("max_value", -0.20),
            )

        # Redemption flow proxy (placeholder until volume data available)
        rf_config = components.get("redemption_flow", {})
        sub_scores["redemption_flow"] = rf_config.get("placeholder", 50)

        # Spread rate of change
        roc_config = components.get("spread_roc", {})
        lookback = roc_config.get("lookback_days", 30)
        current_spread = hy_value
        past_spread = _fetch_value_days_ago(conn, roc_config.get("ticker", "BAMLH0A0HYM2"), lookback)
        if current_spread is not None and past_spread is not None:
            roc = current_spread - past_spread
            sub_scores["spread_roc"] = linear_score(
                roc, roc_config.get("min_value", 0), roc_config.get("max_value", 200),
            )

        score = compute_composite_score(sub_scores, pc_config)

        if score is None:
            logger.warning("Private Credit: no input data available, skipping score write")
            return None

        data_time = min(timestamps) if timestamps else None
        write_score(conn, f"{ticker_prefix}SCORE_PRIVATE_CREDIT", score, data_time=data_time)
    finally:
        conn.close()

    return score
