"""Integration tests for rolling correlation computation with real TimescaleDB.

Seeds 40 days of known index values, runs compute_correlations, and verifies
the stored correlation values match numpy.corrcoef for the same windows.

Requires a running TimescaleDB instance. Set DATABASE_URL to connect.
"""

import os
from datetime import datetime, timezone, timedelta

import numpy as np
import psycopg2
import pytest

from correlator import CORRELATION_PAIRS, ROLLING_WINDOW, compute_correlations


CORR_TICKERS = list(CORRELATION_PAIRS.keys())
INDEX_TICKERS = ["IDX_PRIVATE_CREDIT", "IDX_AI_TECH", "IDX_ENERGY"]
ALL_MANAGED_TICKERS = CORR_TICKERS + INDEX_TICKERS


@pytest.fixture(scope="module")
def db_url():
    """Database URL from environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL environment variable is required for integration tests")
    return url


@pytest.fixture(scope="module")
def db_conn(db_url):
    """Shared database connection for the test module."""
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def clean_test_data(db_conn):
    """Remove all test-related rows before and after each test."""
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s)",
            (ALL_MANAGED_TICKERS,),
        )
    yield
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s)",
            (ALL_MANAGED_TICKERS,),
        )


def _seed_index_values(db_conn, n_days=40):
    """Seed known index return values for all three indices.

    Uses deterministic random data so correlation is reproducible.
    Returns dict of {ticker: np.array of values}.
    """
    rng = np.random.default_rng(12345)
    base = datetime(2025, 6, 1, 16, 0, 0, tzinfo=timezone.utc)

    # Generate correlated data: credit and tech will be positively correlated
    # through a shared factor
    shared_factor = rng.normal(0, 0.01, n_days)
    noise_credit = rng.normal(0, 0.005, n_days)
    noise_tech = rng.normal(0, 0.005, n_days)
    noise_energy = rng.normal(0, 0.01, n_days)

    index_values = {
        "IDX_PRIVATE_CREDIT": shared_factor + noise_credit,
        "IDX_AI_TECH": shared_factor + noise_tech,
        "IDX_ENERGY": noise_energy,  # independent of the other two
    }

    with db_conn.cursor() as cur:
        for ticker, values in index_values.items():
            for i, val in enumerate(values):
                ts = base + timedelta(days=i)
                cur.execute(
                    "INSERT INTO time_series (time, ticker, value, source) "
                    "VALUES (%s, %s, %s, 'computed') "
                    "ON CONFLICT (time, ticker) DO UPDATE SET "
                    "value = EXCLUDED.value, source = EXCLUDED.source",
                    (ts, ticker, float(val)),
                )

    return index_values


class TestIntegrationComputeCorrelations:
    """End-to-end: seed index values -> compute correlations -> verify stored values."""

    def test_computes_and_stores_all_three_correlation_pairs(self, db_conn, db_url):
        """After running compute_correlations, all three CORR_ tickers exist."""
        _seed_index_values(db_conn, n_days=40)
        compute_correlations(db_url)

        with db_conn.cursor() as cur:
            for corr_ticker in CORR_TICKERS:
                cur.execute(
                    "SELECT COUNT(*) FROM time_series "
                    "WHERE ticker = %s AND source = 'computed'",
                    (corr_ticker,),
                )
                count = cur.fetchone()[0]
                assert count > 0, f"No computed rows found for {corr_ticker}"

    def test_correlation_values_match_numpy(self, db_conn, db_url):
        """Stored correlation at the last date matches numpy.corrcoef for the same 30-day window."""
        index_values = _seed_index_values(db_conn, n_days=40)
        compute_correlations(db_url)

        base = datetime(2025, 6, 1, 16, 0, 0, tzinfo=timezone.utc)

        for corr_ticker, (idx_a, idx_b) in CORRELATION_PAIRS.items():
            with db_conn.cursor() as cur:
                cur.execute(
                    "SELECT time, value FROM time_series "
                    "WHERE ticker = %s AND source = 'computed' "
                    "ORDER BY time DESC LIMIT 1",
                    (corr_ticker,),
                )
                row = cur.fetchone()
                assert row is not None, f"No rows found for {corr_ticker}"

                stored_time, stored_value = row

            # Compute expected: last 30 values of each index
            a_vals = index_values[idx_a][-30:]
            b_vals = index_values[idx_b][-30:]
            expected = np.corrcoef(a_vals, b_vals)[0, 1]

            assert stored_value == pytest.approx(expected, abs=0.001), (
                f"{corr_ticker}: stored={stored_value}, expected={expected}"
            )

    def test_correlation_values_bounded(self, db_conn, db_url):
        """All stored correlation values are between -1.0 and 1.0."""
        _seed_index_values(db_conn, n_days=40)
        compute_correlations(db_url)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT ticker, value FROM time_series "
                "WHERE ticker = ANY(%s) AND source = 'computed'",
                (CORR_TICKERS,),
            )
            rows = cur.fetchall()

        assert len(rows) > 0
        for ticker, value in rows:
            assert -1.0 <= value <= 1.0, (
                f"{ticker} has out-of-range correlation: {value}"
            )

    def test_nan_not_stored(self, db_conn, db_url):
        """NaN correlation values are not written to the database."""
        _seed_index_values(db_conn, n_days=40)
        compute_correlations(db_url)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT ticker, value FROM time_series "
                "WHERE ticker = ANY(%s) AND source = 'computed'",
                (CORR_TICKERS,),
            )
            rows = cur.fetchall()

        for ticker, value in rows:
            assert value is not None and not np.isnan(value), (
                f"{ticker} has NaN stored in database"
            )

    def test_insufficient_data_produces_no_rows(self, db_conn, db_url):
        """With only 20 days of index data (< 30 window), no correlation rows are written."""
        _seed_index_values(db_conn, n_days=20)
        compute_correlations(db_url)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM time_series "
                "WHERE ticker = ANY(%s) AND source = 'computed'",
                (CORR_TICKERS,),
            )
            count = cur.fetchone()[0]

        assert count == 0, f"Expected 0 correlation rows with 20 days of data, got {count}"

    def test_exactly_30_days_produces_one_correlation_per_pair(self, db_conn, db_url):
        """With exactly 30 days of data, one correlation value per pair."""
        _seed_index_values(db_conn, n_days=30)
        compute_correlations(db_url)

        with db_conn.cursor() as cur:
            for corr_ticker in CORR_TICKERS:
                cur.execute(
                    "SELECT COUNT(*) FROM time_series "
                    "WHERE ticker = %s AND source = 'computed'",
                    (corr_ticker,),
                )
                count = cur.fetchone()[0]
                assert count == 1, (
                    f"{corr_ticker}: expected 1 row with 30 days, got {count}"
                )

    def test_40_days_produces_11_correlations_per_pair(self, db_conn, db_url):
        """With 40 days of data, rolling window produces 11 valid correlations (40 - 30 + 1)."""
        _seed_index_values(db_conn, n_days=40)
        compute_correlations(db_url)

        with db_conn.cursor() as cur:
            for corr_ticker in CORR_TICKERS:
                cur.execute(
                    "SELECT COUNT(*) FROM time_series "
                    "WHERE ticker = %s AND source = 'computed'",
                    (corr_ticker,),
                )
                count = cur.fetchone()[0]
                assert count == 11, (
                    f"{corr_ticker}: expected 11 rows with 40 days, got {count}"
                )

    def test_idempotent_rerun(self, db_conn, db_url):
        """Running compute_correlations twice does not duplicate rows."""
        _seed_index_values(db_conn, n_days=40)
        compute_correlations(db_url)
        compute_correlations(db_url)

        with db_conn.cursor() as cur:
            for corr_ticker in CORR_TICKERS:
                cur.execute(
                    "SELECT COUNT(*) FROM time_series "
                    "WHERE ticker = %s AND source = 'computed'",
                    (corr_ticker,),
                )
                count = cur.fetchone()[0]
                assert count == 11, (
                    f"{corr_ticker}: expected 11 rows after double run, got {count}"
                )

    def test_api_can_query_correlation_series(self, db_conn, db_url):
        """Correlation data is queryable via the same time_series table the API uses."""
        _seed_index_values(db_conn, n_days=40)
        compute_correlations(db_url)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT time, ticker, value, source FROM time_series "
                "WHERE ticker = %s ORDER BY time ASC",
                ("CORR_CREDIT_TECH",),
            )
            rows = cur.fetchall()

        assert len(rows) == 11
        for row in rows:
            assert row[1] == "CORR_CREDIT_TECH"
            assert row[3] == "computed"
            assert -1.0 <= row[2] <= 1.0
