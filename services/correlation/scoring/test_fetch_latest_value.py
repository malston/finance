"""Unit tests for fetch_latest_value with max_age_hours parameter.

Tests cover: backward compatibility (no max_age), stale data filtering,
fresh data retrieval, and None return when no matching rows exist.
"""

from datetime import datetime, timezone, timedelta
from unittest.mock import MagicMock, call

import pytest

from scoring.common import fetch_latest_value


def _make_mock_conn(fetchone_return):
    """Build a mock connection whose cursor returns the given value."""
    conn = MagicMock()
    cursor = MagicMock()
    cursor.fetchone.return_value = fetchone_return
    cursor.__enter__ = MagicMock(return_value=cursor)
    cursor.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value = cursor
    return conn, cursor


class TestFetchLatestValueBackwardCompat:
    """max_age_hours=None preserves the original behavior."""

    def test_returns_value_when_row_exists(self):
        conn, cursor = _make_mock_conn((42.5,))
        result = fetch_latest_value(conn, "SPY")
        assert result == 42.5

    def test_returns_none_when_no_rows(self):
        conn, cursor = _make_mock_conn(None)
        result = fetch_latest_value(conn, "SPY")
        assert result is None

    def test_query_has_no_time_filter(self):
        conn, cursor = _make_mock_conn((10.0,))
        fetch_latest_value(conn, "SPY")
        executed_sql = cursor.execute.call_args[0][0]
        assert "NOW()" not in executed_sql
        assert "INTERVAL" not in executed_sql

    def test_default_max_age_is_none(self):
        """Calling without max_age_hours should not filter by time."""
        conn, cursor = _make_mock_conn((10.0,))
        fetch_latest_value(conn, "SPY")
        executed_sql = cursor.execute.call_args[0][0]
        assert "NOW()" not in executed_sql


class TestFetchLatestValueWithMaxAge:
    """max_age_hours filters out stale data."""

    def test_query_includes_time_filter(self):
        conn, cursor = _make_mock_conn((55.0,))
        fetch_latest_value(conn, "VIXY", max_age_hours=2)
        executed_sql = cursor.execute.call_args[0][0]
        assert "NOW()" in executed_sql or "now()" in executed_sql.lower()

    def test_returns_value_when_fresh(self):
        conn, cursor = _make_mock_conn((55.0,))
        result = fetch_latest_value(conn, "VIXY", max_age_hours=2)
        assert result == 55.0

    def test_returns_none_when_no_matching_rows(self):
        conn, cursor = _make_mock_conn(None)
        result = fetch_latest_value(conn, "VIXY", max_age_hours=2)
        assert result is None

    def test_max_age_passed_as_query_parameter(self):
        """The max_age_hours value should be passed as a SQL parameter, not interpolated."""
        conn, cursor = _make_mock_conn((10.0,))
        fetch_latest_value(conn, "CL=F", max_age_hours=4)
        params = cursor.execute.call_args[0][1]
        # Should have ticker + max_age_hours in params
        assert "CL=F" in params
        assert 4 in params

    def test_accepts_float_max_age(self):
        conn, cursor = _make_mock_conn((10.0,))
        result = fetch_latest_value(conn, "SPY", max_age_hours=0.5)
        assert result == 10.0
        params = cursor.execute.call_args[0][1]
        assert 0.5 in params


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
