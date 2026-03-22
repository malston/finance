"""Energy/Geopolitical scoring function.

Computes a 0-100 stress score from crude oil price level, crude price
volatility, and Taiwan ETF drawdown. Reads inputs from TimescaleDB and
writes the result back as SCORE_ENERGY_GEO.
"""

import logging
import math
from datetime import datetime, timezone, timedelta
from typing import Any

import psycopg2

from scoring.common import (
    compute_composite_score,
    fetch_latest_value,
    inverted_linear_score,
    linear_score,
    write_score,
)

logger = logging.getLogger(__name__)


def _fetch_daily_values(
    conn: psycopg2.extensions.connection,
    ticker: str,
    days: int,
) -> list[float]:
    """Fetch daily closing values for a ticker over the last N days."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    with conn.cursor() as cur:
        cur.execute(
            "SELECT value FROM time_series "
            "WHERE ticker = %s AND time >= %s "
            "ORDER BY time ASC",
            (ticker, cutoff),
        )
        return [row[0] for row in cur.fetchall()]


def compute_rolling_volatility(values: list[float]) -> float | None:
    """Compute annualized volatility from daily values using log returns.

    Returns None if fewer than 2 data points are available.
    """
    if len(values) < 2:
        return None

    log_returns = []
    for i in range(1, len(values)):
        if values[i - 1] > 0 and values[i] > 0:
            log_returns.append(math.log(values[i] / values[i - 1]))

    if len(log_returns) < 2:
        return None

    mean = sum(log_returns) / len(log_returns)
    variance = sum((r - mean) ** 2 for r in log_returns) / (len(log_returns) - 1)
    daily_std = math.sqrt(variance)

    # Annualize (252 trading days)
    return daily_std * math.sqrt(252)


def compute_drawdown(values: list[float]) -> float | None:
    """Compute drawdown from the highest value in the series.

    Returns a negative number (e.g., -0.15 for a 15% drawdown), or None if
    the series is empty.
    """
    if not values:
        return None
    peak = max(values)
    if peak <= 0:
        return None
    current = values[-1]
    return (current - peak) / peak


def score_energy_geo_from_values(
    crude_value: float | None,
    crude_volatility: float | None,
    ewt_drawdown: float | None,
    config: dict[str, Any],
) -> float | None:
    """Compute energy/geo score from raw input values without DB access.

    Args:
        crude_value: Current crude oil price, or None if unavailable.
        crude_volatility: Annualized crude volatility, or None if unavailable.
        ewt_drawdown: EWT drawdown from recent high (negative), or None.
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed score (0-100), or None if no data is available.
    """
    eg_config = config.get("scoring", {}).get("energy_geo", {})
    components = eg_config.get("components", {})
    sub_scores: dict[str, float] = {}

    # Crude oil price level
    if crude_value is not None:
        cl_cfg = components.get("crude_level", {})
        sub_scores["crude_level"] = linear_score(
            crude_value,
            cl_cfg.get("min_value", 30),
            cl_cfg.get("max_value", 120),
        )

    # Crude price volatility
    if crude_volatility is not None:
        cv_cfg = components.get("crude_volatility", {})
        sub_scores["crude_volatility"] = linear_score(
            crude_volatility,
            cv_cfg.get("min_value", 0.15),
            cv_cfg.get("max_value", 0.50),
        )

    # EWT drawdown (inverted scale: 0 = no drawdown, -0.25 = max stress)
    if ewt_drawdown is not None:
        ewt_cfg = components.get("ewt_drawdown", {})
        sub_scores["ewt_drawdown"] = inverted_linear_score(
            ewt_drawdown,
            ewt_cfg.get("min_value", 0),
            ewt_cfg.get("max_value", -0.25),
        )

    return compute_composite_score(sub_scores, eg_config)


def score_energy_geo(db_url: str, config: dict[str, Any]) -> float | None:
    """Compute Energy/Geopolitical score and write it to TimescaleDB.

    Reads crude oil prices and EWT from the time_series table, computes 3
    sub-component scores using configurable thresholds, writes the result
    back as SCORE_ENERGY_GEO, and returns the score.

    Returns None without writing to DB if no input data is available.

    Args:
        db_url: PostgreSQL/TimescaleDB connection string.
        config: Full scoring config dict (with top-level 'scoring' key).

    Returns:
        The computed score (0-100), or None if no data is available.
    """
    eg_config = config.get("scoring", {}).get("energy_geo", {})
    components = eg_config.get("components", {})

    conn = psycopg2.connect(db_url)
    try:
        # Crude oil level
        crude_ticker = components.get("crude_level", {}).get("ticker", "CL=F")
        crude_value = fetch_latest_value(conn, crude_ticker, max_age_hours=2)

        # Crude volatility (rolling std dev of daily returns)
        cv_cfg = components.get("crude_volatility", {})
        cv_ticker = cv_cfg.get("ticker", "CL=F")
        cv_lookback = cv_cfg.get("lookback_days", 30)
        crude_daily = _fetch_daily_values(conn, cv_ticker, cv_lookback)
        crude_volatility = compute_rolling_volatility(crude_daily)
        if crude_volatility is None:
            logger.warning(
                "Energy/Geo: rolling volatility returned None for %s (%d data points)",
                cv_ticker, len(crude_daily),
            )

        # EWT drawdown
        ewt_cfg = components.get("ewt_drawdown", {})
        ewt_ticker = ewt_cfg.get("ticker", "EWT")
        ewt_lookback = ewt_cfg.get("lookback_days", 252)
        ewt_daily = _fetch_daily_values(conn, ewt_ticker, ewt_lookback)
        ewt_drawdown = compute_drawdown(ewt_daily)
        if ewt_drawdown is None:
            logger.warning(
                "Energy/Geo: drawdown returned None for %s (%d data points)",
                ewt_ticker, len(ewt_daily),
            )

        score = score_energy_geo_from_values(
            crude_value, crude_volatility, ewt_drawdown, config,
        )

        if score is None:
            logger.warning("Energy/Geo: no input data available, skipping score write")
            return None

        write_score(conn, "SCORE_ENERGY_GEO", score)
    finally:
        conn.close()

    return score
