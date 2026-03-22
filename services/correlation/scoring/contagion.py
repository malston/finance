"""Cross-Domain Contagion scoring function.

Computes a 0-100 contagion score from max pairwise correlations and VIX level.
Reads inputs from TimescaleDB and writes the result back as SCORE_CONTAGION.
"""

import logging
from typing import Any

import psycopg2

from scoring.common import (
    compute_composite_score,
    fetch_latest_value,
    linear_score,
    write_score,
)

logger = logging.getLogger(__name__)

CORRELATION_TICKERS = [
    "CORR_CREDIT_TECH",
    "CORR_CREDIT_ENERGY",
    "CORR_TECH_ENERGY",
]


def select_max_pairwise_correlation(
    values: dict[str, float | None],
) -> float | None:
    """Select the maximum absolute correlation from pairwise values.

    Args:
        values: Dict mapping CORR_ tickers to their correlation values.
                None values are excluded.

    Returns:
        The maximum absolute correlation, or None if no valid values exist.
    """
    valid = [abs(v) for v in values.values() if v is not None]
    if not valid:
        return None
    return max(valid)


def score_contagion_from_values(
    max_corr: float | None,
    vix_value: float | None,
    config: dict[str, Any],
) -> float | None:
    """Compute contagion score from raw input values without DB access.

    Useful for unit testing and scenarios where values are already fetched.

    Args:
        max_corr: Maximum absolute pairwise correlation, or None if unavailable.
        vix_value: Current VIX level, or None if unavailable.
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed score (0-100), or None if no data is available.
    """
    ct_config = config.get("scoring", {}).get("contagion", {})
    components = ct_config.get("components", {})
    sub_scores: dict[str, float] = {}

    # Max pairwise correlation
    if max_corr is not None:
        corr_cfg = components.get("max_correlation", {})
        sub_scores["max_correlation"] = linear_score(
            max_corr, corr_cfg.get("min_value", 0.1), corr_cfg.get("max_value", 0.7),
        )

    # VIX level (via VIXY ETF proxy)
    if vix_value is not None:
        vix_cfg = components.get("vix_level", {})
        sub_scores["vix_level"] = linear_score(
            vix_value, vix_cfg.get("min_value", 15), vix_cfg.get("max_value", 40),
        )

    return compute_composite_score(sub_scores, ct_config)


def score_contagion(db_url: str, config: dict[str, Any]) -> float | None:
    """Compute Cross-Domain Contagion score and write it to TimescaleDB.

    Reads pairwise correlations and VIX from the time_series table,
    computes sub-component scores using configurable thresholds, writes
    the result back as SCORE_CONTAGION, and returns the score.

    Returns None without writing to DB if no input data is available.

    Args:
        db_url: PostgreSQL/TimescaleDB connection string.
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed score (0-100), or None if no data is available.
    """
    conn = psycopg2.connect(db_url)
    try:
        # Fetch pairwise correlations
        corr_values: dict[str, float | None] = {}
        for ticker in CORRELATION_TICKERS:
            corr_values[ticker] = fetch_latest_value(conn, ticker, max_age_hours=2)

        max_corr = select_max_pairwise_correlation(corr_values)

        # Fetch VIX (via VIXY ETF proxy)
        ct_config = config.get("scoring", {}).get("contagion", {})
        vix_ticker = ct_config.get("components", {}).get("vix_level", {}).get("ticker", "VIXY")
        vix_value = fetch_latest_value(conn, vix_ticker, max_age_hours=2)

        score = score_contagion_from_values(max_corr, vix_value, config)

        if score is None:
            logger.warning("Contagion: no input data available, skipping score write")
            return None

        write_score(conn, "SCORE_CONTAGION", score)
    finally:
        conn.close()

    return score
