"""Domain index construction for the Correlation Engine.

Computes equal-weighted daily return indices for Private Credit, AI/Tech,
and Energy domains from raw ticker prices stored in TimescaleDB.
"""

import logging
from typing import Any

import numpy as np
import pandas as pd
import psycopg2

logger = logging.getLogger(__name__)

INDEX_DEFINITIONS: dict[str, list[str]] = {
    "IDX_PRIVATE_CREDIT": ["OWL", "ARCC", "BXSL", "OBDC"],
    "IDX_AI_TECH": ["NVDA", "MSFT", "GOOGL", "META", "AMZN"],
    "IDX_ENERGY": ["CL=F"],
}


def compute_daily_returns(prices: pd.Series) -> pd.Series:
    """Compute daily percentage returns from a price series.

    Daily return = (price_today - price_yesterday) / price_yesterday.
    The first value is NaN since there is no previous price.
    """
    return prices.pct_change(fill_method=None)


def build_price_dataframe(rows: list[dict[str, Any]]) -> pd.DataFrame:
    """Build a pivoted DataFrame with dates as index and tickers as columns.

    Each row dict must have 'time', 'ticker', and 'value' keys.
    """
    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows)
    pivoted = df.pivot_table(index="time", columns="ticker", values="value", aggfunc="last")
    pivoted.sort_index(inplace=True)
    return pivoted


def compute_index_returns(price_df: pd.DataFrame, tickers: list[str]) -> pd.Series:
    """Compute equal-weighted daily return index from constituent ticker prices.

    Missing tickers for a given day are excluded from the average.
    Returns a Series indexed by date with the index return values.
    """
    if price_df.empty:
        return pd.Series([], dtype=float)

    # Select only the requested tickers that exist in the dataframe
    available = [t for t in tickers if t in price_df.columns]
    if not available:
        return pd.Series([np.nan] * len(price_df), index=price_df.index, dtype=float)

    subset = price_df[available]
    returns = subset.apply(compute_daily_returns)

    # Equal-weighted average across tickers, skipping NaN
    index_returns = returns.mean(axis=1)
    return index_returns


def _fetch_constituent_prices(
    conn: psycopg2.extensions.connection,
    tickers: list[str],
) -> list[dict[str, Any]]:
    """Fetch price history for the given tickers from time_series."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT time, ticker, value FROM time_series "
            "WHERE ticker = ANY(%s) "
            "ORDER BY time ASC",
            (tickers,),
        )
        columns = [desc[0] for desc in cur.description]
        return [dict(zip(columns, row)) for row in cur.fetchall()]


def _store_index_values(
    conn: psycopg2.extensions.connection,
    index_ticker: str,
    index_series: pd.Series,
) -> int:
    """Write computed index return values to time_series with upsert semantics.

    Returns the number of rows written.
    """
    values = []
    for ts, val in index_series.items():
        if pd.isna(val):
            continue
        values.append((ts, index_ticker, float(val), "computed"))

    if not values:
        return 0

    with conn.cursor() as cur:
        # Use executemany with upsert
        cur.executemany(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (time, ticker) DO UPDATE SET "
            "value = EXCLUDED.value, source = EXCLUDED.source",
            values,
        )
    conn.commit()
    return len(values)


def compute_domain_indices(db_url: str) -> None:
    """Compute and store all domain indices.

    Connects to TimescaleDB, reads constituent prices, computes daily return
    indices, and writes results back to time_series.
    """
    conn = psycopg2.connect(db_url)
    try:
        for index_ticker, constituents in INDEX_DEFINITIONS.items():
            rows = _fetch_constituent_prices(conn, constituents)
            if not rows:
                logger.warning(
                    "No price data found for %s constituents: %s",
                    index_ticker,
                    constituents,
                )
                continue

            price_df = build_price_dataframe(rows)
            index_returns = compute_index_returns(price_df, constituents)

            count = _store_index_values(conn, index_ticker, index_returns)
            logger.info(
                "Stored %d return values for %s",
                count,
                index_ticker,
            )
    finally:
        conn.close()
