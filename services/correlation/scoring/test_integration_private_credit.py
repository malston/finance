"""Integration tests for Private Credit scoring with real TimescaleDB.

Seeds known values into time_series, runs score_private_credit(),
and verifies the SCORE_PRIVATE_CREDIT row is written correctly.

Requires DATABASE_URL environment variable pointing to a TimescaleDB instance.
"""

import os
from datetime import datetime, timezone, timedelta

import psycopg2
import pytest

from scoring.common import load_scoring_config
from scoring.private_credit import score_private_credit


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
    """Remove all rows for managed tickers before and after each test."""
    tickers_to_clean = [
        "BAMLH0A0HYM2",
        "BDC_AVG_NAV_DISCOUNT",
        "BDC_VOLUME_PROXY",
        "SCORE_PRIVATE_CREDIT",
    ]
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s)",
            (tickers_to_clean,),
        )
    yield
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s) AND source IN ('test_seed', 'computed')",
            (tickers_to_clean,),
        )


def _seed_hy_spread(db_conn, values_by_day):
    """Seed BAMLH0A0HYM2 values. values_by_day is a list of (days_ago, value)."""
    now = datetime.now(timezone.utc).replace(microsecond=0)
    with db_conn.cursor() as cur:
        for days_ago, value in values_by_day:
            ts = now - timedelta(days=days_ago)
            cur.execute(
                "INSERT INTO time_series (time, ticker, value, source) "
                "VALUES (%s, 'BAMLH0A0HYM2', %s, 'test_seed') "
                "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
                (ts, value),
            )


def _seed_bdc_discount(db_conn, value):
    """Seed a single BDC_AVG_NAV_DISCOUNT value at now."""
    now = datetime.now(timezone.utc).replace(microsecond=0)
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, 'BDC_AVG_NAV_DISCOUNT', %s, 'test_seed') "
            "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
            (now, value),
        )


@pytest.mark.integration
class TestIntegrationScorePrivateCredit:
    """Seed known values, run scoring, verify DB output."""

    def test_midpoint_inputs_produce_score_50(self, db_conn, db_url, config):
        """HY spread at 450bps, BDC discount at -10%, spread ROC at 25bps => score ~50."""
        # Seed HY spread: current=450, 5 days ago=425 => ROC = 25bps
        _seed_hy_spread(db_conn, [(0, 450.0), (5, 425.0)])
        # Seed BDC discount at -10%
        _seed_bdc_discount(db_conn, -0.10)

        score = score_private_credit(db_url, config)

        # Sub-scores:
        # hy_spread: (450-300)/(600-300)*100 = 50, weight 0.35
        # bdc_discount: (0-(-0.10))/(0-(-0.20))*100 = 50, weight 0.25
        # redemption_flow: placeholder 50, weight 0.15
        # spread_roc: (25-0)/(50-0)*100 = 50, weight 0.25
        # Total = 50
        assert score == pytest.approx(50.0, abs=0.01)

        # Verify the score was written to time_series
        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT value, source FROM time_series "
                "WHERE ticker = 'SCORE_PRIVATE_CREDIT' "
                "ORDER BY time DESC LIMIT 1",
            )
            row = cur.fetchone()

        assert row is not None, "SCORE_PRIVATE_CREDIT not found in time_series"
        assert row[0] == pytest.approx(50.0, abs=0.01)
        assert row[1] == "computed"

    def test_high_stress_inputs(self, db_conn, db_url, config):
        """High HY spread, deep BDC discount, rapid spread increase => high score."""
        # HY spread at 570 (high stress), ROC = 570-530 = 40bps over 5 days
        _seed_hy_spread(db_conn, [(0, 570.0), (5, 530.0)])
        # Deep BDC discount at -18%
        _seed_bdc_discount(db_conn, -0.18)

        score = score_private_credit(db_url, config)

        # hy_spread: (570-300)/(600-300)*100 = 90, weight 0.35 => 31.5
        # bdc_discount: (0-(-0.18))/(0-(-0.20))*100 = 90, weight 0.25 => 22.5
        # redemption: placeholder 50, weight 0.15 => 7.5
        # spread_roc: (40-0)/(50-0)*100 = 80, weight 0.25 => 20
        # Total = 81.5
        assert score == pytest.approx(81.5, abs=0.01)

    def test_missing_bdc_discount_renormalizes(self, db_conn, db_url, config):
        """When BDC discount data is missing, remaining weights are renormalized."""
        # Only seed HY spread, no BDC discount
        # HY spread at 450, ROC = 450-425 = 25
        _seed_hy_spread(db_conn, [(0, 450.0), (5, 425.0)])

        score = score_private_credit(db_url, config)

        # hy_spread: 50, weight 0.35
        # bdc_discount: MISSING
        # redemption: 50, weight 0.15
        # spread_roc: 50, weight 0.25
        # Active weight = 0.35+0.15+0.25 = 0.75
        # Weighted sum = 50*0.35 + 50*0.15 + 50*0.25 = 37.5
        # Renormalized = 37.5 / 0.75 = 50
        assert score == pytest.approx(50.0, abs=0.01)

    def test_missing_hy_spread_still_scores(self, db_conn, db_url, config):
        """When HY spread is missing, BDC + redemption + spread_roc are used."""
        # No HY spread seeded, only BDC discount
        _seed_bdc_discount(db_conn, -0.10)

        score = score_private_credit(db_url, config)

        # hy_spread: MISSING (no data)
        # bdc_discount: 50, weight 0.25
        # redemption: 50, weight 0.15
        # spread_roc: MISSING (no HY spread data for ROC)
        # Active weight = 0.25+0.15 = 0.40
        # Weighted sum = 50*0.25 + 50*0.15 = 20
        # Renormalized = 20 / 0.40 = 50
        assert score == pytest.approx(50.0, abs=0.01)

    def test_score_written_with_correct_ticker_and_source(self, db_conn, db_url, config):
        """Verify the DB row has ticker=SCORE_PRIVATE_CREDIT and source=computed."""
        _seed_hy_spread(db_conn, [(0, 450.0), (5, 425.0)])
        _seed_bdc_discount(db_conn, -0.10)

        score_private_credit(db_url, config)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT ticker, source FROM time_series "
                "WHERE ticker = 'SCORE_PRIVATE_CREDIT' "
                "ORDER BY time DESC LIMIT 1",
            )
            row = cur.fetchone()

        assert row is not None
        assert row[0] == "SCORE_PRIVATE_CREDIT"
        assert row[1] == "computed"

    def test_return_value_matches_written_value(self, db_conn, db_url, config):
        """The returned float matches what was written to the DB."""
        _seed_hy_spread(db_conn, [(0, 450.0), (5, 425.0)])
        _seed_bdc_discount(db_conn, -0.10)

        returned_score = score_private_credit(db_url, config)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT value FROM time_series "
                "WHERE ticker = 'SCORE_PRIVATE_CREDIT' "
                "ORDER BY time DESC LIMIT 1",
            )
            db_value = cur.fetchone()[0]

        assert returned_score == pytest.approx(db_value, abs=1e-10)
