"""Cross-Domain Contagion scoring function.

Computes a 0-100 contagion score from max pairwise correlations, VIX level,
MOVE index level, and VIX-MOVE co-movement. Reads inputs from TimescaleDB
and writes the result back as SCORE_CONTAGION.
"""

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import psycopg2
import yaml

from scoring.common import (
    compute_composite_score,
    fetch_latest_value,
    linear_score,
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


def compute_vix_move_comovement(
    vix_score: float,
    move_score: float,
) -> float:
    """Compute VIX-MOVE co-movement as the average of their sub-scores.

    When both VIX and MOVE are elevated, this amplifies the contagion signal.
    """
    return (vix_score + move_score) / 2


def _write_score(
    conn: psycopg2.extensions.connection,
    score: float,
) -> None:
    """Write the computed score to time_series as SCORE_CONTAGION."""
    now = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, 'SCORE_CONTAGION', %s, 'computed') "
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


def score_contagion_from_values(
    max_corr: float | None,
    vix_value: float | None,
    move_value: float | None,
    config: dict[str, Any],
) -> float:
    """Compute contagion score from raw input values without DB access.

    Useful for unit testing and scenarios where values are already fetched.

    Args:
        max_corr: Maximum absolute pairwise correlation, or None if unavailable.
        vix_value: Current VIX level, or None if unavailable.
        move_value: Current MOVE index level, or None if unavailable.
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed score (0-100).
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

    # VIX level
    vix_score = None
    if vix_value is not None:
        vix_cfg = components.get("vix_level", {})
        vix_score = linear_score(
            vix_value, vix_cfg.get("min_value", 15), vix_cfg.get("max_value", 40),
        )
        sub_scores["vix_level"] = vix_score

    # MOVE index level
    move_score = None
    if move_value is not None:
        move_cfg = components.get("move_level", {})
        move_score = linear_score(
            move_value, move_cfg.get("min_value", 80), move_cfg.get("max_value", 160),
        )
        sub_scores["move_level"] = move_score

    # VIX-MOVE co-movement (requires both VIX and MOVE scores)
    if vix_score is not None and move_score is not None:
        sub_scores["vix_move_comovement"] = compute_vix_move_comovement(
            vix_score, move_score,
        )

    return compute_composite_score(sub_scores, ct_config)


def score_contagion(db_url: str, config: dict[str, Any]) -> float:
    """Compute Cross-Domain Contagion score and write it to TimescaleDB.

    Reads pairwise correlations, VIX, and MOVE from the time_series table,
    computes 4 sub-component scores using configurable thresholds, writes
    the result back as SCORE_CONTAGION, and returns the score.

    Args:
        db_url: PostgreSQL/TimescaleDB connection string.
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed score (0-100).
    """
    conn = psycopg2.connect(db_url)
    try:
        # Fetch pairwise correlations
        corr_values: dict[str, float | None] = {}
        for ticker in CORRELATION_TICKERS:
            corr_values[ticker] = fetch_latest_value(conn, ticker)

        max_corr = select_max_pairwise_correlation(corr_values)

        # Fetch VIX (via VIXY ETF proxy) and MOVE
        ct_config = config.get("scoring", {}).get("contagion", {})
        vix_ticker = ct_config.get("components", {}).get("vix_level", {}).get("ticker", "VIXY")
        vix_value = fetch_latest_value(conn, vix_ticker)
        move_value = None  # MOVE index not available on free data sources

        score = score_contagion_from_values(max_corr, vix_value, move_value, config)

        _write_score(conn, score)
    finally:
        conn.close()

    return score
