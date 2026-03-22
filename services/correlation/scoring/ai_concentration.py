"""AI Concentration scoring function.

Computes a 0-100 concentration score from SPY/RSP ratio deviation, SMH
relative performance, and top-10 weight proxy. Reads inputs from TimescaleDB
and writes the result back as SCORE_AI_CONCENTRATION.
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


def score_ai_concentration_from_values(
    spy_rsp_ratio: float | None,
    smh_value: float | None,
    spy_value: float | None,
    config: dict[str, Any],
) -> float | None:
    """Compute AI concentration score from raw input values without DB access.

    Args:
        spy_rsp_ratio: Current SPY/RSP ratio, or None if unavailable.
        smh_value: Current SMH price, or None if unavailable.
        spy_value: Current SPY price, or None if unavailable.
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed score (0-100), or None if no data is available.
    """
    ac_config = config.get("scoring", {}).get("ai_concentration", {})
    components = ac_config.get("components", {})
    sub_scores: dict[str, float] = {}

    # SPY/RSP deviation from 1.0
    if spy_rsp_ratio is not None:
        dev_cfg = components.get("spy_rsp_deviation", {})
        deviation = abs(spy_rsp_ratio - 1.0)
        sub_scores["spy_rsp_deviation"] = linear_score(
            deviation,
            dev_cfg.get("min_deviation", 0),
            dev_cfg.get("max_deviation", 0.15),
        )

    # SMH relative performance vs SPY
    if smh_value is not None and spy_value is not None and spy_value != 0:
        smh_cfg = components.get("smh_relative", {})
        relative = (smh_value - spy_value) / spy_value
        sub_scores["smh_relative"] = linear_score(
            relative,
            smh_cfg.get("min_value", 0),
            smh_cfg.get("max_value", 0.20),
        )

    # Top-10 weight (uses SPY_RSP_RATIO as proxy for concentration)
    if spy_rsp_ratio is not None:
        top10_cfg = components.get("top10_weight", {})
        sub_scores["top10_weight"] = linear_score(
            spy_rsp_ratio,
            top10_cfg.get("min_value", 1.5),
            top10_cfg.get("max_value", 2.5),
        )

    return compute_composite_score(sub_scores, ac_config)


def score_ai_concentration(db_url: str, config: dict[str, Any]) -> float | None:
    """Compute AI Concentration score and write it to TimescaleDB.

    Reads SPY_RSP_RATIO, SMH, and SPY from the time_series table, computes 3
    sub-component scores using configurable thresholds, writes the result back
    as SCORE_AI_CONCENTRATION, and returns the score.

    Returns None without writing to DB if no input data is available.

    Args:
        db_url: PostgreSQL/TimescaleDB connection string.
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed score (0-100), or None if no data is available.
    """
    ac_config = config.get("scoring", {}).get("ai_concentration", {})
    components = ac_config.get("components", {})

    conn = psycopg2.connect(db_url)
    try:
        spy_rsp_ticker = components.get("spy_rsp_deviation", {}).get(
            "ticker", "SPY_RSP_RATIO",
        )
        spy_rsp_ratio = fetch_latest_value(conn, spy_rsp_ticker, max_age_hours=2)

        smh_ticker = components.get("smh_relative", {}).get("ticker_a", "SMH")
        smh_value = fetch_latest_value(conn, smh_ticker, max_age_hours=2)

        spy_ticker = components.get("smh_relative", {}).get("ticker_b", "SPY")
        spy_value = fetch_latest_value(conn, spy_ticker, max_age_hours=2)

        score = score_ai_concentration_from_values(
            spy_rsp_ratio, smh_value, spy_value, config,
        )

        if score is None:
            logger.warning("AI Concentration: no input data available, skipping score write")
            return None

        write_score(conn, "SCORE_AI_CONCENTRATION", score)
    finally:
        conn.close()

    return score
