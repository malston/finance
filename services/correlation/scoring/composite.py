"""Composite Threat Score computation.

Computes a 0-100 weighted average of four domain scores (private credit,
AI concentration, energy/geo, contagion) and maps the result to a threat
level (LOW, ELEVATED, HIGH, CRITICAL). Reads domain scores from TimescaleDB
and writes the result back as SCORE_COMPOSITE.
"""

import logging
from typing import Any

import psycopg2

from scoring.common import fetch_latest_value, write_score

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
    levels = config.get("scoring", {}).get("composite", {}).get("threat_levels", [])
    for entry in levels:
        if score <= entry["max_score"]:
            return entry["level"], entry["color"]
    # Fallback for scores above all thresholds
    last = levels[-1]
    return last["level"], last["color"]


def compute_composite_from_values(
    scores: dict[str, float],
    config: dict[str, Any],
) -> float | None:
    """Compute weighted composite score from domain score values.

    Missing domains are excluded and remaining weights renormalized.

    Args:
        scores: Dict mapping domain names to their score values (0-100).
                Keys: "private_credit", "ai_concentration", "energy_geo", "contagion".
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed composite score (0-100), rounded to 2 decimal places,
        or None if no domain scores are available.
    """
    domains = config.get("scoring", {}).get("composite", {}).get("domains", {})
    weighted_sum = 0.0
    total_weight = 0.0

    for name, domain_config in domains.items():
        if name in scores:
            weight = domain_config.get("weight", 0.25)
            weighted_sum += scores[name] * weight
            total_weight += weight

    if total_weight == 0:
        return None

    composite = weighted_sum / total_weight
    return round(max(0.0, min(100.0, composite)), 2)


def score_composite(db_url: str, config: dict[str, Any]) -> float | None:
    """Compute composite threat score and write it to TimescaleDB.

    Reads the latest value for each domain score ticker, computes the weighted
    average with renormalization for missing domains, writes the result as
    SCORE_COMPOSITE, and returns the score.

    Returns None without writing to DB if no domain scores are available.

    Args:
        db_url: PostgreSQL/TimescaleDB connection string.
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed composite score (0-100), or None if no data is available.
    """
    domains = config.get("scoring", {}).get("composite", {}).get("domains", {})
    conn = psycopg2.connect(db_url)
    try:
        scores: dict[str, float] = {}
        for name, domain_config in domains.items():
            ticker = domain_config.get("ticker", f"SCORE_{name.upper()}")
            value = fetch_latest_value(conn, ticker, max_age_hours=2)
            if value is not None:
                scores[name] = value

        composite = compute_composite_from_values(scores, config)

        if composite is None:
            logger.warning("Composite: no domain scores available, skipping score write")
            return None

        write_score(conn, "SCORE_COMPOSITE", composite)

        level, color = get_threat_level(composite, config)
        logger.info(
            "Composite score: %.2f (%s)", composite, level,
        )
    finally:
        conn.close()

    return composite
