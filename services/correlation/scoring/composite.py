"""Composite Threat Score computation.

Computes a 0-100 weighted average of four domain scores (private credit,
AI concentration, energy/geo, contagion) and maps the result to a threat
level (LOW, ELEVATED, HIGH, CRITICAL). Reads domain scores from TimescaleDB
and writes the result back as SCORE_COMPOSITE.
"""

import logging
from datetime import datetime, timezone
from typing import Any

import psycopg2

logger = logging.getLogger(__name__)


def get_threat_level(
    score: float,
    config: dict[str, Any],
) -> tuple[str, str]:
    """Map a numeric score to a threat level label and color.

    Uses the threshold list from config: score <= max_score determines the band.

    Args:
        score: Numeric score (0-100).
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        Tuple of (level, color) strings.
    """
    levels = config["scoring"]["composite"]["threat_levels"]
    for entry in levels:
        if score <= entry["max_score"]:
            return entry["level"], entry["color"]
    # Fallback for scores above all thresholds
    last = levels[-1]
    return last["level"], last["color"]


def compute_composite_from_values(
    scores: dict[str, float],
    config: dict[str, Any],
) -> float:
    """Compute weighted composite score from domain score values.

    Missing domains are excluded and remaining weights renormalized.

    Args:
        scores: Dict mapping domain names to their score values (0-100).
                Keys: "private_credit", "ai_concentration", "energy_geo", "contagion".
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed composite score (0-100), rounded to 2 decimal places.
    """
    domains = config["scoring"]["composite"]["domains"]
    weighted_sum = 0.0
    total_weight = 0.0

    for name, domain_config in domains.items():
        if name in scores:
            weight = domain_config["weight"]
            weighted_sum += scores[name] * weight
            total_weight += weight

    if total_weight == 0:
        return 0.0

    composite = weighted_sum / total_weight
    return round(max(0.0, min(100.0, composite)), 2)


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


def _write_score(
    conn: psycopg2.extensions.connection,
    score: float,
) -> None:
    """Write the computed score to time_series as SCORE_COMPOSITE."""
    now = datetime.now(timezone.utc)
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, 'SCORE_COMPOSITE', %s, 'computed') "
            "ON CONFLICT (time, ticker) DO UPDATE SET "
            "value = EXCLUDED.value, source = EXCLUDED.source",
            (now, score),
        )
    conn.commit()


def score_composite(db_url: str, config: dict[str, Any]) -> float:
    """Compute composite threat score and write it to TimescaleDB.

    Reads the latest value for each domain score ticker, computes the weighted
    average with renormalization for missing domains, writes the result as
    SCORE_COMPOSITE, and returns the score.

    Args:
        db_url: PostgreSQL/TimescaleDB connection string.
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed composite score (0-100).
    """
    domains = config["scoring"]["composite"]["domains"]
    conn = psycopg2.connect(db_url)
    try:
        scores: dict[str, float] = {}
        for name, domain_config in domains.items():
            ticker = domain_config["ticker"]
            value = _fetch_latest_value(conn, ticker)
            if value is not None:
                scores[name] = value

        composite = compute_composite_from_values(scores, config)

        _write_score(conn, composite)

        level, color = get_threat_level(composite, config)
        logger.info(
            "Composite score: %.2f (%s)", composite, level,
        )
    finally:
        conn.close()

    return composite
