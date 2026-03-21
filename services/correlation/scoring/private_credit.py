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

from scoring.common import (
    compute_composite_score,
    fetch_latest_value,
    inverted_linear_score,
    linear_score,
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
        hy_value = fetch_latest_value(conn, hy_config["ticker"])
        if hy_value is not None:
            sub_scores["hy_spread"] = linear_score(
                hy_value, hy_config["min_value"], hy_config["max_value"],
            )

        # BDC NAV discount (inverted scale)
        bdc_config = components["bdc_discount"]
        bdc_value = fetch_latest_value(conn, bdc_config["ticker"])
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

        score = compute_composite_score(sub_scores, pc_config)

        _write_score(conn, score)
    finally:
        conn.close()

    return score
