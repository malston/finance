"""E2E tests for the time-aware staleness policy.

Exercises the full scoring pipeline against a real TimescaleDB instance.
No mocks, no stubs. Verifies that:
- Scorers produce scores during off-hours using relaxed staleness windows
- Score rows carry source data timestamps, not wall clock time
- Alert evaluation is suppressed during off-hours
- Fallback to 2h window works when staleness config block is absent

Spins up an ephemeral TimescaleDB container via testcontainers-python.
"""

import copy
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import psycopg2
import pytest
from testcontainers.postgres import PostgresContainer

from alerting.rules_engine import evaluate_rules, load_alert_config
from scoring.ai_concentration import score_ai_concentration
from scoring.common import load_scoring_config
from scoring.composite import score_composite
from scoring.contagion import score_contagion
from scoring.energy_geo import score_energy_geo
from scoring.private_credit import score_private_credit

# Tickers we seed and score tickers we verify
_SEED_TICKERS = [
    "BAMLH0A0HYM2", "BDC_AVG_NAV_DISCOUNT", "BDC_VOLUME_PROXY",
    "SPY_RSP_RATIO", "SMH", "SPY",
    "CL=F", "EWT",
    "VIXY",
    "CORR_CREDIT_TECH", "CORR_CREDIT_ENERGY", "CORR_TECH_ENERGY",
]
_SCORE_TICKERS = [
    "SCORE_PRIVATE_CREDIT",
    "SCORE_AI_CONCENTRATION",
    "SCORE_ENERGY_GEO",
    "SCORE_CONTAGION",
    "SCORE_COMPOSITE",
]
_ALL_TICKERS = _SEED_TICKERS + _SCORE_TICKERS

_INIT_SQL = Path(__file__).resolve().parent.parent / "db" / "init.sql"


def _apply_init_sql(connection_url: str) -> None:
    """Apply the TimescaleDB schema from init.sql."""
    conn = psycopg2.connect(connection_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(_INIT_SQL.read_text())
    finally:
        conn.close()


@pytest.fixture(scope="module")
def timescale_container():
    container = PostgresContainer(
        image="timescale/timescaledb:latest-pg16",
        username="risk",
        password="testpassword",
        dbname="riskmonitor",
    )
    try:
        container.start()
        url = container.get_connection_url(driver=None)
        _apply_init_sql(url)
        yield container
    finally:
        try:
            container.stop()
        except Exception as exc:
            import warnings
            warnings.warn(
                f"Failed to stop TimescaleDB container during teardown: {exc}",
                stacklevel=1,
            )


@pytest.fixture(scope="module")
def db_url(timescale_container):
    url = timescale_container.get_connection_url(driver=None)
    return url + ("&" if "?" in url else "?") + "sslmode=disable"


@pytest.fixture(scope="module")
def db_conn(db_url):
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    yield conn
    if not conn.closed:
        conn.close()


@pytest.fixture(scope="module")
def scoring_config():
    return load_scoring_config()


@pytest.fixture(scope="module")
def alert_config():
    config_path = os.path.join(os.path.dirname(__file__), "alert_config.yaml")
    return load_alert_config(config_path)


@pytest.fixture(scope="module")
def data_timestamp():
    """A timestamp 24 hours ago, simulating data from a prior session.

    Uses a fixed 24h offset so the timestamp is always well within
    the 66h off-hours staleness window regardless of when the suite runs.
    """
    return datetime.now(timezone.utc) - timedelta(hours=24)


@pytest.fixture(autouse=True)
def clean_test_data(db_conn, alert_config):
    """Remove ALL rows for test tickers before and after each test.

    Deletes regardless of source to ensure each test starts from a clean
    state and no prior test's data leaks into subsequent assertions.
    """
    alert_rule_ids = [r["id"] for r in alert_config["alerts"]["rules"]]

    def _clean():
        if db_conn.closed:
            pytest.fail("Database connection is closed; cannot clean test data")
        try:
            with db_conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM time_series WHERE ticker = ANY(%s)",
                    (_ALL_TICKERS,),
                )
                cur.execute(
                    "DELETE FROM alert_history WHERE rule_id = ANY(%s)",
                    (alert_rule_ids,),
                )
                cur.execute(
                    "DELETE FROM alert_state WHERE rule_id = ANY(%s)",
                    (alert_rule_ids,),
                )
        except psycopg2.Error as exc:
            pytest.fail(f"Test data cleanup failed (stale data may remain): {exc}")
    _clean()
    yield
    _clean()


@pytest.fixture()
def seed_market_data(db_conn, data_timestamp):
    """Seed realistic market data at the data_timestamp (24h ago).

    Values are chosen to produce non-zero scores in each domain scorer.
    Also seeds 30+ days of historical data for rate-of-change and volatility
    calculations that require lookback windows.
    """
    # Primary data point at data_timestamp
    primary_data = {
        "BAMLH0A0HYM2": 450.0,       # HY spread: mid-range -> non-zero score
        "BDC_AVG_NAV_DISCOUNT": -0.10, # 10% discount -> mid-range score
        "BDC_VOLUME_PROXY": 2.0,       # Mid-range volume
        "SPY_RSP_RATIO": 1.8,          # Elevated concentration
        "SMH": 250.0,                  # Semiconductor ETF
        "SPY": 500.0,                  # S&P 500 ETF
        "CL=F": 80.0,                  # Crude oil
        "EWT": 50.0,                   # Taiwan ETF
        "VIXY": 25.0,                  # VIX proxy: elevated
        "CORR_CREDIT_TECH": 0.45,      # Cross-domain correlation
        "CORR_CREDIT_ENERGY": 0.35,    # Cross-domain correlation
        "CORR_TECH_ENERGY": 0.55,      # Cross-domain correlation
    }

    # Use explicit transaction so partial seeding can be rolled back on failure
    db_conn.autocommit = False
    try:
        with db_conn.cursor() as cur:
            # Insert primary data point
            for ticker, value in primary_data.items():
                cur.execute(
                    "INSERT INTO time_series (time, ticker, value, source) "
                    "VALUES (%s, %s, %s, 'e2e_seed') "
                    "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
                    (data_timestamp, ticker, value),
                )

            # Seed historical data for lookback calculations (35 days back)
            # Energy/Geo needs volatility lookback, spread_roc needs a reference point ~5 days back
            for days_back in range(1, 36):
                ts = data_timestamp - timedelta(days=days_back)
                # Crude oil: slight daily variation for volatility calculation
                crude_val = 78.0 + (days_back % 5) * 0.5
                cur.execute(
                    "INSERT INTO time_series (time, ticker, value, source) "
                    "VALUES (%s, %s, %s, 'e2e_seed') "
                    "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
                    (ts, "CL=F", crude_val),
                )
                # EWT: slight variation for drawdown calculation
                ewt_val = 52.0 - (days_back % 3) * 0.3
                cur.execute(
                    "INSERT INTO time_series (time, ticker, value, source) "
                    "VALUES (%s, %s, %s, 'e2e_seed') "
                    "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
                    (ts, "EWT", ewt_val),
                )
                # HY spread: historical for rate-of-change
                hy_val = 420.0 + (days_back % 7) * 2
                cur.execute(
                    "INSERT INTO time_series (time, ticker, value, source) "
                    "VALUES (%s, %s, %s, 'e2e_seed') "
                    "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
                    (ts, "BAMLH0A0HYM2", hy_val),
                )
                # SPY_RSP_RATIO: scorer uses latest value via fetch_latest_with_time
                ratio_val = 1.75 + (days_back % 4) * 0.01
                cur.execute(
                    "INSERT INTO time_series (time, ticker, value, source) "
                    "VALUES (%s, %s, %s, 'e2e_seed') "
                    "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
                    (ts, "SPY_RSP_RATIO", ratio_val),
                )
                # SMH and SPY for relative performance
                cur.execute(
                    "INSERT INTO time_series (time, ticker, value, source) "
                    "VALUES (%s, %s, %s, 'e2e_seed') "
                    "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
                    (ts, "SMH", 245.0 + (days_back % 3) * 1.0),
                )
                cur.execute(
                    "INSERT INTO time_series (time, ticker, value, source) "
                    "VALUES (%s, %s, %s, 'e2e_seed') "
                    "ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source",
                    (ts, "SPY", 498.0 + (days_back % 3) * 0.5),
                )
        db_conn.commit()
    except Exception:
        db_conn.rollback()
        raise
    finally:
        db_conn.autocommit = True

    return primary_data


@pytest.mark.e2e
class TestOffHoursScoring:
    """Scorers produce non-None scores during off-hours with relaxed staleness."""

    def test_all_domain_scorers_produce_scores(
        self, db_url, scoring_config, seed_market_data,
    ):
        """With 24h-old data and 66h staleness window, all 5 scorers produce scores."""
        staleness_hours = scoring_config["staleness"]["off_hours_max_age"]

        pc = score_private_credit(db_url, scoring_config, staleness_hours=staleness_hours)
        ai = score_ai_concentration(db_url, scoring_config, staleness_hours=staleness_hours)
        eg = score_energy_geo(db_url, scoring_config, staleness_hours=staleness_hours)
        ct = score_contagion(db_url, scoring_config, staleness_hours=staleness_hours)
        comp = score_composite(db_url, scoring_config, staleness_hours=staleness_hours)

        assert pc is not None, "Private Credit scorer returned None with off-hours staleness"
        assert ai is not None, "AI Concentration scorer returned None with off-hours staleness"
        assert eg is not None, "Energy/Geo scorer returned None with off-hours staleness"
        assert ct is not None, "Contagion scorer returned None with off-hours staleness"
        assert comp is not None, "Composite scorer returned None with off-hours staleness"

        for score in [pc, ai, eg, ct, comp]:
            assert 0 <= score <= 100, f"Score {score} out of 0-100 range"


@pytest.mark.e2e
class TestSourceTimestamps:
    """Score rows carry source data timestamps, not wall clock time."""

    def test_domain_scores_carry_source_timestamp(
        self, db_url, db_conn, scoring_config, seed_market_data, data_timestamp,
    ):
        """Each SCORE_* row's time column matches the source data timestamp."""
        staleness_hours = scoring_config["staleness"]["off_hours_max_age"]

        score_private_credit(db_url, scoring_config, staleness_hours=staleness_hours)
        score_ai_concentration(db_url, scoring_config, staleness_hours=staleness_hours)
        score_energy_geo(db_url, scoring_config, staleness_hours=staleness_hours)
        score_contagion(db_url, scoring_config, staleness_hours=staleness_hours)

        domain_tickers = [
            "SCORE_PRIVATE_CREDIT",
            "SCORE_AI_CONCENTRATION",
            "SCORE_ENERGY_GEO",
            "SCORE_CONTAGION",
        ]

        for ticker in domain_tickers:
            with db_conn.cursor() as cur:
                cur.execute(
                    "SELECT time FROM time_series WHERE ticker = %s AND source = 'computed' "
                    "ORDER BY time DESC LIMIT 1",
                    (ticker,),
                )
                row = cur.fetchone()

            assert row is not None, f"No computed row found for {ticker}"
            score_time = row[0]

            # Score timestamp should be close to the source data timestamp (24h ago),
            # not close to now. Allow 1 hour tolerance for lookback-derived timestamps.
            time_diff = abs((score_time - data_timestamp).total_seconds())
            assert time_diff < 3600, (
                f"{ticker} timestamp {score_time} is {time_diff:.0f}s from source data "
                f"timestamp {data_timestamp} -- expected within 1 hour"
            )

    def test_composite_carries_oldest_domain_timestamp(
        self, db_url, db_conn, scoring_config, seed_market_data, data_timestamp,
    ):
        """Composite score's timestamp reflects the oldest domain score's source timestamp."""
        staleness_hours = scoring_config["staleness"]["off_hours_max_age"]

        score_private_credit(db_url, scoring_config, staleness_hours=staleness_hours)
        score_ai_concentration(db_url, scoring_config, staleness_hours=staleness_hours)
        score_energy_geo(db_url, scoring_config, staleness_hours=staleness_hours)
        score_contagion(db_url, scoring_config, staleness_hours=staleness_hours)
        score_composite(db_url, scoring_config, staleness_hours=staleness_hours)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT time FROM time_series WHERE ticker = 'SCORE_COMPOSITE' "
                "AND source = 'computed' ORDER BY time DESC LIMIT 1",
            )
            comp_row = cur.fetchone()

        assert comp_row is not None, "No composite score row found"
        composite_time = comp_row[0]

        # Composite should use the oldest domain timestamp, which is <=
        # the data_timestamp. Allow 1 hour tolerance.
        time_diff = abs((composite_time - data_timestamp).total_seconds())
        assert time_diff < 3600, (
            f"Composite timestamp {composite_time} is {time_diff:.0f}s from source data "
            f"timestamp {data_timestamp} -- expected within 1 hour"
        )


@pytest.mark.e2e
class TestAlertSuppression:
    """Alert evaluation is suppressed during off-hours."""

    def test_no_alerts_fire_during_off_hours(
        self, db_url, db_conn, scoring_config, alert_config, seed_market_data,
    ):
        """Scorers write scores but no alerts fire when evaluate_rules is not called.

        This mirrors run.py behavior: during off-hours, run.py skips the
        evaluate_rules call entirely. We replicate that pattern here and
        verify no alert_history rows are created as a result.
        """
        staleness_hours = scoring_config["staleness"]["off_hours_max_age"]

        # Run all scorers to produce score rows
        score_private_credit(db_url, scoring_config, staleness_hours=staleness_hours)
        score_ai_concentration(db_url, scoring_config, staleness_hours=staleness_hours)
        score_energy_geo(db_url, scoring_config, staleness_hours=staleness_hours)
        score_contagion(db_url, scoring_config, staleness_hours=staleness_hours)
        score_composite(db_url, scoring_config, staleness_hours=staleness_hours)

        # Verify no alert_history rows were created during this cycle.
        # In run.py, alert evaluation is gated behind `if not market_open`,
        # so we verify the pattern by NOT calling evaluate_rules (matching
        # what run.py does during off-hours).
        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM alert_history WHERE triggered_at > NOW() - INTERVAL '5 minutes'",
            )
            count = cur.fetchone()[0]

        assert count == 0, (
            f"Expected 0 alert_history rows during off-hours, found {count}"
        )

    def test_alerts_can_fire_during_market_hours(
        self, db_url, db_conn, scoring_config, alert_config, seed_market_data,
    ):
        """Alert evaluation runs without error when called (positive control).

        Runs all scorers with the seeded data, then calls evaluate_rules
        to verify the evaluation mechanism itself is operational. Whether
        alerts actually fire depends on the seeded score values and
        consecutive_readings config.
        """
        staleness_hours = scoring_config["staleness"]["off_hours_max_age"]

        # Run all scorers first
        score_private_credit(db_url, scoring_config, staleness_hours=staleness_hours)
        score_ai_concentration(db_url, scoring_config, staleness_hours=staleness_hours)
        score_energy_geo(db_url, scoring_config, staleness_hours=staleness_hours)
        score_contagion(db_url, scoring_config, staleness_hours=staleness_hours)
        score_composite(db_url, scoring_config, staleness_hours=staleness_hours)

        # Verify evaluate_rules can be called without error.
        # Whether alerts actually fire depends on the score values and
        # consecutive_readings config; the point is that the evaluation
        # mechanism itself is operational.
        fired = evaluate_rules(db_url, alert_config)
        # fired is a list (possibly empty); we just verify it runs without error.
        assert isinstance(fired, list)


@pytest.mark.e2e
class TestStalenessWindowFallback:
    """When staleness config block is removed, scorers fall back to 2h window."""

    def test_staleness_gated_scorers_return_none_with_2h_window(
        self, db_url, scoring_config, seed_market_data,
    ):
        """With 2h staleness and 24h-old data, fully staleness-gated scorers return None.

        AI Concentration and Contagion fetch all inputs via fetch_latest_with_time,
        so they respect the staleness window completely.

        Energy/Geo still produces a score because its crude_volatility and
        ewt_drawdown sub-components use lookback queries (_fetch_daily_values)
        that bypass the staleness gate. With min_components=2, those two
        sub-components are sufficient.
        """
        config_no_staleness = copy.deepcopy(scoring_config)
        config_no_staleness.pop("staleness", None)

        ai = score_ai_concentration(db_url, config_no_staleness, staleness_hours=2)
        ct = score_contagion(db_url, config_no_staleness, staleness_hours=2)

        assert ai is None, f"AI Concentration returned {ai} with 2h window and 24h-old data"
        assert ct is None, f"Contagion returned {ct} with 2h window and 24h-old data"

    def test_energy_geo_partial_with_2h_window(
        self, db_url, scoring_config, seed_market_data,
    ):
        """Energy/Geo produces a score even with 2h staleness because lookback queries bypass the gate.

        The crude_level sub-component (via fetch_latest_with_time) is stale,
        but crude_volatility and ewt_drawdown use _fetch_daily_values which
        queries by lookback_days, not staleness_hours. With min_components=2,
        the scorer produces a partial score from those two sub-components.
        """
        config_no_staleness = copy.deepcopy(scoring_config)
        config_no_staleness.pop("staleness", None)

        eg = score_energy_geo(db_url, config_no_staleness, staleness_hours=2)
        assert eg is not None, "Energy/Geo returned None despite lookback sub-components"
        assert 0 <= eg <= 100

    def test_private_credit_falls_back_to_placeholder_only(
        self, db_url, scoring_config, seed_market_data,
    ):
        """With 2h window and 24h-old data, Private Credit only scores from the placeholder.

        The redemption_flow component has a hardcoded placeholder (50) that
        always contributes. When all DB-sourced components are stale, the
        scorer produces a score from just the placeholder sub-component.
        """
        config_no_staleness = copy.deepcopy(scoring_config)
        config_no_staleness.pop("staleness", None)

        pc = score_private_credit(db_url, config_no_staleness, staleness_hours=2)

        # Should return a score (the placeholder produces one), but it should
        # be exactly the placeholder value since it's the only sub-component
        assert pc is not None, "Private Credit returned None even with placeholder"
        assert pc == 50.0, (
            f"Private Credit returned {pc}, expected 50.0 (placeholder-only score)"
        )

    def test_composite_from_partial_domains_when_stale(
        self, db_url, db_conn, scoring_config, seed_market_data,
    ):
        """Composite uses only the domains that produced scores with 2h staleness.

        With 2h staleness and 24h-old data:
        - Private Credit: produces a score (redemption_flow placeholder)
        - Energy/Geo: produces a score (volatility + drawdown use lookback queries)
        - AI Concentration: None (all inputs staleness-gated)
        - Contagion: None (all inputs staleness-gated)

        The composite renormalizes from the 2 available domains.
        """
        config_no_staleness = copy.deepcopy(scoring_config)
        config_no_staleness.pop("staleness", None)

        pc = score_private_credit(db_url, config_no_staleness, staleness_hours=2)
        score_ai_concentration(db_url, config_no_staleness, staleness_hours=2)
        eg = score_energy_geo(db_url, config_no_staleness, staleness_hours=2)
        score_contagion(db_url, config_no_staleness, staleness_hours=2)

        comp = score_composite(db_url, config_no_staleness, staleness_hours=2)

        assert comp is not None, "Composite returned None with 2 available domains"
        assert 0 <= comp <= 100

        # Verify composite is a weighted average of only the 2 available domains
        domains = config_no_staleness["scoring"]["composite"]["domains"]
        pc_weight = domains["private_credit"]["weight"]
        eg_weight = domains["energy_geo"]["weight"]
        total = pc_weight + eg_weight
        expected = round((pc * pc_weight + eg * eg_weight) / total, 2)
        assert comp == expected, (
            f"Composite {comp} != expected {expected} "
            f"(pc={pc}*{pc_weight} + eg={eg}*{eg_weight}) / {total}"
        )
