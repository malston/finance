"""Rolling 30-day Pearson correlation computation between domain indices.

Reads IDX_PRIVATE_CREDIT, IDX_AI_TECH, IDX_ENERGY from time_series,
computes pairwise rolling correlations, and writes results back as
CORR_CREDIT_TECH, CORR_CREDIT_ENERGY, CORR_TECH_ENERGY.
"""

import logging

import numpy as np
import pandas as pd
import psycopg2

logger = logging.getLogger(__name__)

ROLLING_WINDOW = 30

CORRELATION_PAIRS: dict[str, tuple[str, str]] = {
    "CORR_CREDIT_TECH": ("IDX_PRIVATE_CREDIT", "IDX_AI_TECH"),
    "CORR_CREDIT_ENERGY": ("IDX_PRIVATE_CREDIT", "IDX_ENERGY"),
    "CORR_TECH_ENERGY": ("IDX_AI_TECH", "IDX_ENERGY"),
}


def compute_pairwise_correlations(
    series_a: pd.Series,
    series_b: pd.Series,
    window: int = ROLLING_WINDOW,
) -> pd.Series:
    """Compute rolling Pearson correlation between two time series.

    Aligns the series by their shared index (date intersection), then
    computes a rolling window correlation. Returns a Series indexed
    by the shared dates; positions with fewer than `window` observations
    are NaN.
    """
    if series_a.empty or series_b.empty:
        return pd.Series([], dtype=float)

    # Align on shared dates
    combined = pd.DataFrame({"a": series_a, "b": series_b}).dropna()

    if combined.empty:
        return pd.Series([], dtype=float)

    result = combined["a"].rolling(window=window, min_periods=window).corr(combined["b"])

    # Replace non-finite values (inf/-inf from zero-variance windows) with NaN
    result = result.where(np.isfinite(result))

    return result


def _fetch_index_series(
    conn: psycopg2.extensions.connection,
    ticker: str,
) -> pd.Series:
    """Fetch all values for a given index ticker from time_series, ordered by time."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT time, value FROM time_series "
            "WHERE ticker = %s AND source = 'computed' "
            "ORDER BY time ASC",
            (ticker,),
        )
        rows = cur.fetchall()

    if not rows:
        return pd.Series([], dtype=float)

    times = [row[0] for row in rows]
    values = [row[1] for row in rows]
    return pd.Series(values, index=pd.DatetimeIndex(times))



def _store_correlation_values(
    conn: psycopg2.extensions.connection,
    corr_ticker: str,
    corr_series: pd.Series,
) -> int:
    """Write non-NaN correlation values to time_series with upsert semantics.

    Returns the number of rows written.
    """
    values = []
    for ts, val in corr_series.items():
        if pd.isna(val):
            continue
        values.append((ts, corr_ticker, float(val), "computed"))

    if not values:
        return 0

    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (time, ticker) DO UPDATE SET "
            "value = EXCLUDED.value, source = EXCLUDED.source",
            values,
        )
    conn.commit()
    return len(values)


def compute_correlations(db_url: str) -> None:
    """Compute and store rolling 30-day Pearson correlations for all index pairs.

    Connects to TimescaleDB, reads domain index values, computes pairwise
    rolling correlations, and writes results back to time_series.
    """
    conn = psycopg2.connect(db_url)
    try:
        # Load all index series once
        index_series: dict[str, pd.Series] = {}
        all_index_tickers = set()
        for idx_a, idx_b in CORRELATION_PAIRS.values():
            all_index_tickers.add(idx_a)
            all_index_tickers.add(idx_b)

        for ticker in all_index_tickers:
            index_series[ticker] = _fetch_index_series(conn, ticker)
            if index_series[ticker].empty:
                logger.warning("No data found for index %s", ticker)

        # Compute and store each correlation pair
        for corr_ticker, (idx_a, idx_b) in CORRELATION_PAIRS.items():
            series_a = index_series[idx_a]
            series_b = index_series[idx_b]

            if series_a.empty or series_b.empty:
                logger.warning(
                    "Skipping %s: missing data for %s or %s",
                    corr_ticker, idx_a, idx_b,
                )
                continue

            corr = compute_pairwise_correlations(series_a, series_b, window=ROLLING_WINDOW)
            count = _store_correlation_values(conn, corr_ticker, corr)
            logger.info("Stored %d correlation values for %s", count, corr_ticker)
    finally:
        conn.close()
