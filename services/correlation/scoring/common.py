"""Shared scoring utility functions.

Provides linear_score, inverted_linear_score, composite score computation,
and database fetch helpers used across multiple scoring modules.
"""

from typing import Any

import psycopg2


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
) -> float:
    """Compute weighted average of sub-scores with renormalization for missing components.

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


def fetch_latest_value(
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
