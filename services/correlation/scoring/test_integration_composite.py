"""Integration tests for composite threat score with real TimescaleDB.

Seeds known domain scores into time_series, runs score_composite(), and verifies
the SCORE_COMPOSITE row is written correctly with expected weighted average.

Requires DATABASE_URL environment variable pointing to a TimescaleDB instance.
"""

import os
from datetime import datetime, timezone

import psycopg2
import pytest

from scoring.composite import score_composite, get_threat_level
from scoring.common import load_scoring_config


DOMAIN_TICKERS = [
    "SCORE_PRIVATE_CREDIT",
    "SCORE_AI_CONCENTRATION",
    "SCORE_ENERGY_GEO",
    "SCORE_CONTAGION",
]
ALL_MANAGED_TICKERS = DOMAIN_TICKERS + ["SCORE_COMPOSITE"]


@pytest.fixture(scope="module")
def db_url():
    """Database URL from environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL environment variable is required for integration tests")
    return url


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
    yield
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s)",
            (ALL_MANAGED_TICKERS,),
        )


def _seed_score(db_conn, ticker, value):
    """Seed a domain score value into time_series."""
    now = datetime.now(timezone.utc)
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, %s, %s, 'computed') "
            "ON CONFLICT (time, ticker) DO UPDATE SET "
            "value = EXCLUDED.value, source = EXCLUDED.source",
            (now, ticker, value),
        )


def _read_composite_score(db_conn):
    """Read the latest SCORE_COMPOSITE value."""
    with db_conn.cursor() as cur:
        cur.execute(
            "SELECT value, source FROM time_series "
            "WHERE ticker = 'SCORE_COMPOSITE' "
            "ORDER BY time DESC LIMIT 1",
        )
        return cur.fetchone()


class TestIntegrationScoreComposite:
    """End-to-end: seed domain scores -> score_composite() -> verify DB output."""

    def test_acceptance_criteria_values(self, db_conn, db_url, config):
        """AC: seed four domain scores, verify composite and threat level."""
        _seed_score(db_conn, "SCORE_PRIVATE_CREDIT", 68.0)
        _seed_score(db_conn, "SCORE_AI_CONCENTRATION", 52.0)
        _seed_score(db_conn, "SCORE_ENERGY_GEO", 74.0)
        _seed_score(db_conn, "SCORE_CONTAGION", 61.0)

        result = score_composite(db_url, config)

        # 68*0.30 + 52*0.20 + 74*0.25 + 61*0.25
        # = 20.4 + 10.4 + 18.5 + 15.25 = 64.55
        assert result == pytest.approx(64.55, abs=0.5)

        row = _read_composite_score(db_conn)
        assert row is not None
        assert row[0] == pytest.approx(result, abs=0.01)
        assert row[1] == "computed"

        # Verify threat level
        level, color = get_threat_level(result, config)
        assert level == "HIGH"
        assert color == "#f97316"

    def test_composite_written_with_correct_ticker_and_source(self, db_conn, db_url, config):
        """SCORE_COMPOSITE is written with source='computed'."""
        _seed_score(db_conn, "SCORE_PRIVATE_CREDIT", 40.0)
        _seed_score(db_conn, "SCORE_AI_CONCENTRATION", 30.0)
        _seed_score(db_conn, "SCORE_ENERGY_GEO", 35.0)
        _seed_score(db_conn, "SCORE_CONTAGION", 50.0)

        score_composite(db_url, config)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT ticker, source FROM time_series "
                "WHERE ticker = 'SCORE_COMPOSITE' "
                "ORDER BY time DESC LIMIT 1",
            )
            row = cur.fetchone()

        assert row is not None
        assert row[0] == "SCORE_COMPOSITE"
        assert row[1] == "computed"

    def test_all_scores_at_100_gives_100(self, db_conn, db_url, config):
        """When all domain scores are 100, composite is 100."""
        for ticker in DOMAIN_TICKERS:
            _seed_score(db_conn, ticker, 100.0)

        result = score_composite(db_url, config)
        assert result == pytest.approx(100.0, abs=0.1)

    def test_all_scores_at_zero_gives_zero(self, db_conn, db_url, config):
        """When all domain scores are 0, composite is 0."""
        for ticker in DOMAIN_TICKERS:
            _seed_score(db_conn, ticker, 0.0)

        result = score_composite(db_url, config)
        assert result == pytest.approx(0.0, abs=0.1)

    def test_missing_one_domain_renormalizes(self, db_conn, db_url, config):
        """When private_credit is missing, remaining weights renormalize."""
        _seed_score(db_conn, "SCORE_AI_CONCENTRATION", 50.0)
        _seed_score(db_conn, "SCORE_ENERGY_GEO", 50.0)
        _seed_score(db_conn, "SCORE_CONTAGION", 50.0)

        result = score_composite(db_url, config)
        # All 50 with renormalization -> 50
        assert result == pytest.approx(50.0, abs=0.5)

    def test_missing_two_domains_renormalizes(self, db_conn, db_url, config):
        """When two domains are missing, remaining weights renormalize."""
        _seed_score(db_conn, "SCORE_ENERGY_GEO", 80.0)
        _seed_score(db_conn, "SCORE_CONTAGION", 40.0)

        result = score_composite(db_url, config)
        # Weights: 0.25+0.25 = 0.50
        # (80*0.25 + 40*0.25) / 0.50 = 30/0.50 = 60
        assert result == pytest.approx(60.0, abs=0.5)

    def test_all_data_missing_returns_none(self, db_conn, db_url, config):
        """When no domain scores exist, composite is None."""
        result = score_composite(db_url, config)
        assert result is None

    def test_return_value_matches_written_value(self, db_conn, db_url, config):
        """The returned float matches the value stored in the database."""
        _seed_score(db_conn, "SCORE_PRIVATE_CREDIT", 55.0)
        _seed_score(db_conn, "SCORE_AI_CONCENTRATION", 30.0)
        _seed_score(db_conn, "SCORE_ENERGY_GEO", 45.0)
        _seed_score(db_conn, "SCORE_CONTAGION", 70.0)

        returned = score_composite(db_url, config)
        row = _read_composite_score(db_conn)
        assert row is not None
        assert row[0] == pytest.approx(returned, abs=0.01)
