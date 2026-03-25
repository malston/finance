"""Integration tests for Cross-Domain Contagion scoring with real TimescaleDB.

Seeds known correlation, VIX, and MOVE values into time_series, runs
score_contagion(), and verifies the SCORE_CONTAGION row is written correctly.

Requires DATABASE_URL environment variable pointing to a TimescaleDB instance.
"""

import os
from datetime import datetime, timezone, timedelta

import psycopg2
import pytest

from scoring.common import load_scoring_config
from scoring.contagion import score_contagion


CORR_TICKERS = ["CORR_CREDIT_TECH", "CORR_CREDIT_ENERGY", "CORR_TECH_ENERGY"]
ALL_MANAGED_TICKERS = CORR_TICKERS + ["VIXY", "SCORE_CONTAGION"]


@pytest.fixture(scope="module")
def config():
    """Load scoring config from YAML."""
    config_path = os.path.join(
        os.path.dirname(os.path.dirname(__file__)),
        "scoring_config.yaml",
    )
    return load_scoring_config(config_path)


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
        cur.execute("DELETE FROM news_sentiment")
        cur.execute("DELETE FROM insider_trades")
    yield
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s)",
            (ALL_MANAGED_TICKERS,),
        )


def _seed_correlation(db_conn, ticker, value):
    """Seed a single correlation value."""
    now = datetime.now(timezone.utc)
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, %s, %s, 'computed') "
            "ON CONFLICT (time, ticker) DO UPDATE SET "
            "value = EXCLUDED.value, source = EXCLUDED.source",
            (now, ticker, value),
        )


def _seed_market_data(db_conn, ticker, value, source="finnhub"):
    """Seed a market data value (VIX, MOVE)."""
    now = datetime.now(timezone.utc)
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (time, ticker) DO UPDATE SET "
            "value = EXCLUDED.value, source = EXCLUDED.source",
            (now, ticker, value, source),
        )


def _read_score(db_conn):
    """Read the latest SCORE_CONTAGION value."""
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT value, source FROM time_series "
            "WHERE ticker = 'SCORE_CONTAGION' "
            "ORDER BY time DESC LIMIT 1",
        )
        return cur.fetchone()


@pytest.mark.integration
class TestIntegrationScoreContagion:
    """End-to-end: seed inputs -> score_contagion() -> verify DB output."""

    def test_acceptance_criteria_values(self, db_conn, db_url, config):
        """AC: seed correlation=0.5, VIXY=28, verify score."""
        _seed_correlation(db_conn, "CORR_CREDIT_TECH", 0.5)
        _seed_correlation(db_conn, "CORR_CREDIT_ENERGY", 0.3)
        _seed_correlation(db_conn, "CORR_TECH_ENERGY", 0.2)
        _seed_market_data(db_conn, "VIXY", 28.0)

        result = score_contagion(db_url, config)

        # max_corr = 0.5 -> (0.5-0.1)/(0.7-0.1)*100 = 66.67
        # vix = 28 -> (28-15)/(50-15)*100 = 37.14
        # composite = (66.67*0.60 + 37.14*0.40) / 1.0 = 40.0 + 14.86 = 54.86
        assert result == pytest.approx(54.86, abs=0.5)

        row = _read_score(db_conn)
        assert row is not None
        assert row[0] == pytest.approx(result, abs=0.01)
        assert row[1] == "computed"

    def test_score_written_with_correct_ticker_and_source(self, db_conn, db_url, config):
        """SCORE_CONTAGION is written with source='computed'."""
        _seed_correlation(db_conn, "CORR_CREDIT_TECH", 0.4)
        _seed_correlation(db_conn, "CORR_CREDIT_ENERGY", 0.2)
        _seed_correlation(db_conn, "CORR_TECH_ENERGY", 0.1)
        _seed_market_data(db_conn, "VIXY", 20.0)

        score_contagion(db_url, config)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT ticker, source FROM time_series "
                "WHERE ticker = 'SCORE_CONTAGION' "
                "ORDER BY time DESC LIMIT 1",
            )
            row = cur.fetchone()

        assert row is not None
        assert row[0] == "SCORE_CONTAGION"
        assert row[1] == "computed"

    def test_high_stress_all_inputs_maxed(self, db_conn, db_url, config):
        """When all inputs are at or above max thresholds, score is 100."""
        _seed_correlation(db_conn, "CORR_CREDIT_TECH", 0.9)
        _seed_correlation(db_conn, "CORR_CREDIT_ENERGY", 0.8)
        _seed_correlation(db_conn, "CORR_TECH_ENERGY", 0.7)
        _seed_market_data(db_conn, "VIXY", 50.0)

        result = score_contagion(db_url, config)
        assert result == pytest.approx(100.0, abs=0.1)

    def test_low_stress_all_inputs_at_minimum(self, db_conn, db_url, config):
        """When all inputs are at or below min thresholds, score is 0."""
        _seed_correlation(db_conn, "CORR_CREDIT_TECH", 0.05)
        _seed_correlation(db_conn, "CORR_CREDIT_ENERGY", 0.02)
        _seed_correlation(db_conn, "CORR_TECH_ENERGY", 0.01)
        _seed_market_data(db_conn, "VIXY", 12.0)

        result = score_contagion(db_url, config)
        assert result == pytest.approx(0.0, abs=0.1)

    def test_missing_correlations_renormalizes(self, db_conn, db_url, config):
        """When no CORR_ tickers exist, score is based on VIX only."""
        _seed_market_data(db_conn, "VIXY", 27.5)

        result = score_contagion(db_url, config)
        # vix = 27.5 -> (27.5-15)/(50-15)*100 = 35.71
        # Only vix_level present, renormalized: 35.71*0.40/0.40 = 35.71
        assert result == pytest.approx(35.71, abs=0.5)

    def test_missing_vix_renormalizes(self, db_conn, db_url, config):
        """When VIX is missing, remaining components are renormalized."""
        _seed_correlation(db_conn, "CORR_CREDIT_TECH", 0.4)
        _seed_correlation(db_conn, "CORR_CREDIT_ENERGY", 0.2)
        _seed_correlation(db_conn, "CORR_TECH_ENERGY", 0.1)

        result = score_contagion(db_url, config)
        # max_corr = abs(0.4) = 0.4 -> (0.4-0.1)/(0.7-0.1)*100 = 50
        # Only max_correlation present, renormalized: 50*0.60/0.60 = 50
        assert result == pytest.approx(50.0, abs=0.5)

    def test_negative_correlation_uses_absolute(self, db_conn, db_url, config):
        """Negative correlations are absolute-valued for max selection."""
        _seed_correlation(db_conn, "CORR_CREDIT_TECH", -0.6)
        _seed_correlation(db_conn, "CORR_CREDIT_ENERGY", 0.1)
        _seed_correlation(db_conn, "CORR_TECH_ENERGY", 0.1)
        _seed_market_data(db_conn, "VIXY", 15.0)

        result = score_contagion(db_url, config)
        # max_corr = 0.6 -> (0.6-0.1)/(0.7-0.1)*100 = 83.33
        # vix = 15 -> (15-15)/(50-15)*100 = 0
        # composite = (83.33*0.60 + 0*0.40) / 1.0 = 50.0
        assert result == pytest.approx(50.0, abs=0.5)

    def test_return_value_matches_written_value(self, db_conn, db_url, config):
        """The returned float matches the value stored in the database."""
        _seed_correlation(db_conn, "CORR_CREDIT_TECH", 0.5)
        _seed_correlation(db_conn, "CORR_CREDIT_ENERGY", 0.3)
        _seed_correlation(db_conn, "CORR_TECH_ENERGY", 0.2)
        _seed_market_data(db_conn, "VIXY", 25.0)

        returned = score_contagion(db_url, config)
        row = _read_score(db_conn)
        assert row is not None
        assert row[0] == pytest.approx(returned, abs=0.01)

    def test_all_data_missing_returns_none(self, db_conn, db_url, config):
        """When no input data exists, score is None."""
        result = score_contagion(db_url, config)
        assert result is None
