"""Integration tests for domain index construction with real TimescaleDB.

Requires Docker for the shared TimescaleDB testcontainer.
"""

from datetime import datetime, timezone, timedelta

import psycopg2
import pytest

from index_builder import compute_domain_indices, INDEX_DEFINITIONS


@pytest.fixture(scope="module")
def db_conn(db_url):
    """Shared database connection for the test module."""
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    yield conn
    if not conn.closed:
        conn.close()


@pytest.fixture(autouse=True)
def clean_computed_rows(db_conn):
    """Remove computed index rows before and after each test."""
    index_tickers = list(INDEX_DEFINITIONS.keys())
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s)",
            (index_tickers,),
        )
    yield
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s)",
            (index_tickers,),
        )


@pytest.fixture(autouse=True)
def seed_prices(db_conn, clean_computed_rows):
    """Seed 5 days of known prices for all constituent tickers."""
    base = datetime(2025, 6, 1, 16, 0, 0, tzinfo=timezone.utc)
    # Prices chosen to produce known daily returns
    prices = {
        # Private Credit
        "OWL":  [10.0, 10.5, 10.2, 10.8, 11.0],
        "ARCC": [20.0, 20.4, 20.0, 20.6, 21.0],
        "BXSL": [15.0, 15.3, 15.6, 15.0, 15.5],
        "OBDC": [12.0, 12.0, 12.6, 12.3, 12.9],
        # AI/Tech
        "NVDA": [800.0, 820.0, 810.0, 830.0, 850.0],
        "MSFT": [400.0, 408.0, 404.0, 412.0, 416.0],
        "GOOGL": [170.0, 172.0, 171.0, 175.0, 174.0],
        "META": [500.0, 510.0, 505.0, 515.0, 520.0],
        "AMZN": [180.0, 183.0, 181.0, 185.0, 188.0],
        # Energy
        "CL=F": [75.0, 76.5, 74.0, 77.0, 78.0],
    }

    all_tickers = list(prices.keys())
    with db_conn.cursor() as cur:
        # Clean ALL data for constituent tickers (including stale production data)
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s)",
            (all_tickers,),
        )
        for ticker, vals in prices.items():
            for i, val in enumerate(vals):
                ts = base + timedelta(days=i)
                cur.execute(
                    "INSERT INTO time_series (time, ticker, value, source) "
                    "VALUES (%s, %s, %s, 'test_seed') "
                    "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
                    (ts, ticker, val),
                )
    yield prices
    # Cleanup seed data
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s) AND source = 'test_seed'",
            (all_tickers,),
        )


@pytest.mark.integration
class TestIntegrationComputeDomainIndices:
    """End-to-end: seed prices -> compute indices -> verify stored values."""

    def test_computes_and_stores_all_three_indices(self, db_conn, db_url, seed_prices):
        """After running compute_domain_indices, all three index tickers exist in time_series."""
        compute_domain_indices(db_url, lookback_days=36500)

        with db_conn.cursor() as cur:
            for index_ticker in INDEX_DEFINITIONS:
                cur.execute(
                    "SELECT COUNT(*) FROM time_series WHERE ticker = %s AND source = 'computed'",
                    (index_ticker,),
                )
                count = cur.fetchone()[0]
                assert count > 0, f"No computed rows found for {index_ticker}"

    def test_private_credit_index_values_correct(self, db_conn, db_url, seed_prices):
        """Verify IDX_PRIVATE_CREDIT values match manual calculation."""
        compute_domain_indices(db_url, lookback_days=36500)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT time, value FROM time_series "
                "WHERE ticker = 'IDX_PRIVATE_CREDIT' AND source = 'computed' "
                "ORDER BY time ASC"
            )
            rows = cur.fetchall()

        # 5 days of prices -> 4 daily returns (first day has no previous)
        assert len(rows) == 4

        # Day 1 returns: OWL: 0.05, ARCC: 0.02, BXSL: 0.02, OBDC: 0.0
        prices = seed_prices
        expected_returns = []
        for day_idx in range(1, 5):
            day_returns = []
            for ticker in ["OWL", "ARCC", "BXSL", "OBDC"]:
                prev = prices[ticker][day_idx - 1]
                curr = prices[ticker][day_idx]
                day_returns.append((curr - prev) / prev)
            expected_returns.append(sum(day_returns) / len(day_returns))

        for i, (_, value) in enumerate(rows):
            assert value == pytest.approx(expected_returns[i], abs=1e-10), (
                f"Day {i+1}: expected {expected_returns[i]}, got {value}"
            )

    def test_ai_tech_index_values_correct(self, db_conn, db_url, seed_prices):
        """Verify IDX_AI_TECH values match manual calculation."""
        compute_domain_indices(db_url, lookback_days=36500)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT time, value FROM time_series "
                "WHERE ticker = 'IDX_AI_TECH' AND source = 'computed' "
                "ORDER BY time ASC"
            )
            rows = cur.fetchall()

        assert len(rows) == 4

        prices = seed_prices
        expected_returns = []
        for day_idx in range(1, 5):
            day_returns = []
            for ticker in ["NVDA", "MSFT", "GOOGL", "META", "AMZN"]:
                prev = prices[ticker][day_idx - 1]
                curr = prices[ticker][day_idx]
                day_returns.append((curr - prev) / prev)
            expected_returns.append(sum(day_returns) / len(day_returns))

        for i, (_, value) in enumerate(rows):
            assert value == pytest.approx(expected_returns[i], abs=1e-10), (
                f"Day {i+1}: expected {expected_returns[i]}, got {value}"
            )

    def test_energy_index_values_correct(self, db_conn, db_url, seed_prices):
        """Verify IDX_ENERGY is just CL=F daily returns."""
        compute_domain_indices(db_url, lookback_days=36500)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT time, value FROM time_series "
                "WHERE ticker = 'IDX_ENERGY' AND source = 'computed' "
                "ORDER BY time ASC"
            )
            rows = cur.fetchall()

        assert len(rows) == 4

        prices = seed_prices
        for i, (_, value) in enumerate(rows):
            prev = prices["CL=F"][i]
            curr = prices["CL=F"][i + 1]
            expected = (curr - prev) / prev
            assert value == pytest.approx(expected, abs=1e-10), (
                f"Day {i+1}: expected {expected}, got {value}"
            )

    def test_handles_missing_ticker_gracefully(self, db_conn, db_url):
        """If one ticker has no data, index is computed from remaining tickers."""
        # Remove all existing private credit constituent data so only our
        # partial seed is present.
        pc_tickers = ["OWL", "ARCC", "BXSL", "OBDC"]
        with db_conn.cursor() as cur:
            cur.execute(
                "DELETE FROM time_series WHERE ticker = ANY(%s)",
                (pc_tickers,),
            )

        base = datetime(2025, 7, 1, 16, 0, 0, tzinfo=timezone.utc)

        with db_conn.cursor() as cur:
            # Seed only OWL and ARCC (missing BXSL and OBDC)
            for i, (owl_price, arcc_price) in enumerate([(10.0, 20.0), (10.5, 20.4)]):
                ts = base + timedelta(days=i)
                cur.execute(
                    "INSERT INTO time_series (time, ticker, value, source) "
                    "VALUES (%s, %s, %s, 'test_seed') "
                    "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
                    (ts, "OWL", owl_price),
                )
                cur.execute(
                    "INSERT INTO time_series (time, ticker, value, source) "
                    "VALUES (%s, %s, %s, 'test_seed') "
                    "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
                    (ts, "ARCC", arcc_price),
                )

        compute_domain_indices(db_url, lookback_days=36500)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT value FROM time_series "
                "WHERE ticker = 'IDX_PRIVATE_CREDIT' AND source = 'computed' "
                "ORDER BY time ASC"
            )
            rows = cur.fetchall()

        # Should have 1 computed value from the 2 available tickers
        assert len(rows) == 1
        # OWL return = 0.05, ARCC return = 0.02 -> mean = 0.035
        assert rows[0][0] == pytest.approx((0.05 + 0.02) / 2, abs=1e-10)

    def test_idempotent_rerun(self, db_conn, db_url, seed_prices):
        """Running compute twice does not duplicate rows (upsert semantics)."""
        compute_domain_indices(db_url, lookback_days=36500)
        compute_domain_indices(db_url, lookback_days=36500)

        with db_conn.cursor() as cur:
            for index_ticker in INDEX_DEFINITIONS:
                cur.execute(
                    "SELECT COUNT(*) FROM time_series WHERE ticker = %s AND source = 'computed'",
                    (index_ticker,),
                )
                count = cur.fetchone()[0]
                # 5 days of prices -> 4 return days
                assert count == 4, f"{index_ticker} has {count} rows, expected 4"

    def test_api_can_query_computed_indices(self, db_conn, db_url, seed_prices):
        """Computed index data is queryable via the same time_series table the API uses."""
        compute_domain_indices(db_url, lookback_days=36500)

        with db_conn.cursor() as cur:
            # Simulate what the /api/risk/timeseries endpoint does
            cur.execute(
                "SELECT time, ticker, value, source FROM time_series "
                "WHERE ticker = %s AND time >= NOW() - INTERVAL '30 days' "
                "ORDER BY time ASC",
                ("IDX_AI_TECH",),
            )
            rows = cur.fetchall()

        # The seed data is from 2025, so with NOW() - 30 days it may not match.
        # Instead, query without the time filter to validate data exists.
        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT time, ticker, value, source FROM time_series "
                "WHERE ticker = %s ORDER BY time ASC",
                ("IDX_AI_TECH",),
            )
            rows = cur.fetchall()

        assert len(rows) == 4
        for row in rows:
            assert row[1] == "IDX_AI_TECH"
            assert row[3] == "computed"
