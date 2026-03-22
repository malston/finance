"""Integration tests for fetch_latest_value with max_age_hours parameter.

Tests cover: stale data filtering, fresh data retrieval,
and None return when no matching rows exist.
"""

from datetime import datetime, timezone, timedelta

import pytest

from scoring.common import fetch_latest_value


class TestFetchLatestValueIntegration:
    """Integration tests requiring DATABASE_URL.

    These test actual SQL execution against TimescaleDB to verify
    that the time-filtering query works correctly.
    """

    @pytest.fixture()
    def db_conn(self):
        import os
        url = os.environ.get("DATABASE_URL")
        if not url:
            pytest.skip("DATABASE_URL required for integration tests")
        import psycopg2
        conn = psycopg2.connect(url)
        conn.autocommit = True
        yield conn
        conn.close()

    @pytest.fixture(autouse=True)
    def clean_test_data(self, db_conn):
        with db_conn.cursor() as cur:
            cur.execute(
                "DELETE FROM time_series WHERE ticker = 'TEST_STALE_DATA'",
            )
        yield
        with db_conn.cursor() as cur:
            cur.execute(
                "DELETE FROM time_series WHERE ticker = 'TEST_STALE_DATA'",
            )

    def _seed(self, db_conn, value, hours_ago=0):
        ts = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
        with db_conn.cursor() as cur:
            cur.execute(
                "INSERT INTO time_series (time, ticker, value, source) "
                "VALUES (%s, 'TEST_STALE_DATA', %s, 'test')",
                (ts, value),
            )

    def test_no_max_age_returns_any_value(self, db_conn):
        self._seed(db_conn, 100.0, hours_ago=48)
        result = fetch_latest_value(db_conn, "TEST_STALE_DATA")
        assert result == pytest.approx(100.0)

    def test_max_age_filters_stale_data(self, db_conn):
        self._seed(db_conn, 100.0, hours_ago=5)
        result = fetch_latest_value(db_conn, "TEST_STALE_DATA", max_age_hours=2)
        assert result is None

    def test_max_age_returns_fresh_data(self, db_conn):
        self._seed(db_conn, 42.0, hours_ago=0.5)
        result = fetch_latest_value(db_conn, "TEST_STALE_DATA", max_age_hours=2)
        assert result == pytest.approx(42.0)

    def test_max_age_returns_most_recent_fresh(self, db_conn):
        """When both stale and fresh data exist, return the most recent fresh value."""
        self._seed(db_conn, 10.0, hours_ago=5)
        self._seed(db_conn, 99.0, hours_ago=0.1)
        result = fetch_latest_value(db_conn, "TEST_STALE_DATA", max_age_hours=2)
        assert result == pytest.approx(99.0)
