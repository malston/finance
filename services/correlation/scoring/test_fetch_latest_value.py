"""Integration tests for fetch_latest_value with max_age_hours parameter.

Tests cover: stale data filtering, fresh data retrieval,
None return when no matching rows exist, input validation,
and logging of stale-vs-missing data distinctions.
"""

import logging
from datetime import datetime, timezone, timedelta

import psycopg2
import pytest

from scoring.common import fetch_latest_value


@pytest.fixture(scope="module")
def db_conn(db_url):
    """Shared database connection for the test module."""
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    yield conn
    if not conn.closed:
        conn.close()


@pytest.mark.integration
class TestMaxAgeHoursValidation:
    """Validation of max_age_hours rejects zero and negative values."""

    def test_max_age_hours_zero_raises_value_error(self, db_conn):
        with pytest.raises(ValueError, match="max_age_hours must be positive"):
            fetch_latest_value(db_conn, "ANY_TICKER", max_age_hours=0)

    def test_max_age_hours_negative_raises_value_error(self, db_conn):
        with pytest.raises(ValueError, match="max_age_hours must be positive"):
            fetch_latest_value(db_conn, "ANY_TICKER", max_age_hours=-1)


@pytest.mark.integration
class TestStalenessLogging:
    """Verify that fetch_latest_value logs distinct messages for stale vs missing data."""

    @pytest.fixture(autouse=True)
    def clean_test_data(self, db_conn):
        with db_conn.cursor() as cur:
            cur.execute(
                "DELETE FROM time_series WHERE ticker = 'TEST_STALE_LOG'",
            )
        yield
        with db_conn.cursor() as cur:
            cur.execute(
                "DELETE FROM time_series WHERE ticker = 'TEST_STALE_LOG'",
            )

    def _seed(self, db_conn, value, hours_ago=0):
        ts = datetime.now(timezone.utc) - timedelta(hours=hours_ago)
        with db_conn.cursor() as cur:
            cur.execute(
                "INSERT INTO time_series (time, ticker, value, source) "
                "VALUES (%s, 'TEST_STALE_LOG', %s, 'test')",
                (ts, value),
            )

    def test_logs_warning_when_data_exists_but_stale(self, db_conn, caplog):
        """Data exists but is older than max_age_hours -- should log a warning."""
        self._seed(db_conn, 50.0, hours_ago=10)
        with caplog.at_level(logging.WARNING, logger="scoring.common"):
            result = fetch_latest_value(
                db_conn, "TEST_STALE_LOG", max_age_hours=2,
            )
        assert result is None
        assert any("Stale data for TEST_STALE_LOG" in m for m in caplog.messages)

    def test_logs_debug_when_no_data_at_all(self, db_conn, caplog):
        """No data exists for the ticker -- should log at debug level only."""
        with caplog.at_level(logging.DEBUG, logger="scoring.common"):
            result = fetch_latest_value(
                db_conn, "TEST_STALE_LOG", max_age_hours=2,
            )
        assert result is None
        assert any("No data found for TEST_STALE_LOG" in m for m in caplog.messages)
        # Should NOT contain the stale warning
        assert not any("Stale data" in m for m in caplog.messages)

    def test_no_staleness_log_when_fresh_data_returned(self, db_conn, caplog):
        """When fresh data is found, no staleness logs should appear."""
        self._seed(db_conn, 42.0, hours_ago=0.5)
        with caplog.at_level(logging.DEBUG, logger="scoring.common"):
            result = fetch_latest_value(
                db_conn, "TEST_STALE_LOG", max_age_hours=2,
            )
        assert result == pytest.approx(42.0)
        assert not any("Stale data" in m for m in caplog.messages)
        assert not any("No data found" in m for m in caplog.messages)

    def test_no_staleness_log_when_no_max_age(self, db_conn, caplog):
        """When max_age_hours is None, no staleness logging should occur."""
        with caplog.at_level(logging.DEBUG, logger="scoring.common"):
            result = fetch_latest_value(db_conn, "TEST_STALE_LOG")
        assert result is None
        assert not any("Stale data" in m for m in caplog.messages)


@pytest.mark.integration
class TestFetchLatestValueIntegration:
    """Integration tests for fetch_latest_value SQL execution.

    Verifies time-filtering queries work correctly against a real
    TimescaleDB instance via the shared testcontainer.
    """

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
