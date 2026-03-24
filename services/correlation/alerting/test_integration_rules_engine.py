"""Integration tests for alert rules engine with real TimescaleDB.

Seeds time_series with escalating scores, runs the rules engine multiple times,
and verifies alerts fire at the correct consecutive count with cooldown enforcement.

Requires DATABASE_URL environment variable pointing to a TimescaleDB instance.
"""

import os
from datetime import datetime, timedelta, timezone

import psycopg2
import pytest
import yaml

CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "alert_config.yaml",
)

MANAGED_TICKERS = ["SCORE_COMPOSITE", "VIXY", "SCORE_CONTAGION"]


@pytest.fixture(scope="module")
def db_url():
    """Database URL from environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL not set; integration tests require a running TimescaleDB")
    return url


@pytest.fixture(scope="module")
def alert_config():
    """Load alert config from YAML."""
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


@pytest.fixture(scope="module")
def db_conn(db_url):
    """Shared database connection for the test module.

    Also ensures alert_state and alert_history tables exist before tests run.
    """
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS alert_state (
                rule_id           TEXT PRIMARY KEY,
                consecutive_count INTEGER NOT NULL DEFAULT 0,
                last_triggered    TIMESTAMPTZ,
                last_value        DOUBLE PRECISION
            )
        """)
        cur.execute("""
            CREATE TABLE IF NOT EXISTS alert_history (
                id           SERIAL PRIMARY KEY,
                rule_id      TEXT NOT NULL,
                triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                value        DOUBLE PRECISION NOT NULL,
                message      TEXT NOT NULL,
                channels     TEXT[] NOT NULL,
                delivered    BOOLEAN NOT NULL DEFAULT FALSE
            )
        """)
    yield conn
    conn.close()


@pytest.fixture(autouse=True)
def clean_test_data(db_conn):
    """Remove all test-related rows before and after each test."""
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s)",
            (MANAGED_TICKERS,),
        )
        cur.execute("DELETE FROM alert_history")
        cur.execute("DELETE FROM alert_state")
    yield
    with db_conn.cursor() as cur:
        cur.execute(
            "DELETE FROM time_series WHERE ticker = ANY(%s)",
            (MANAGED_TICKERS,),
        )
        cur.execute("DELETE FROM alert_history")
        cur.execute("DELETE FROM alert_state")


def _seed_reading(db_conn, ticker, value, time_offset_minutes=0):
    """Seed a time_series reading at a specific time offset from now."""
    ts = datetime.now(timezone.utc) - timedelta(minutes=time_offset_minutes)
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO time_series (time, ticker, value, source) "
            "VALUES (%s, %s, %s, 'test') "
            "ON CONFLICT (time, ticker) DO UPDATE SET "
            "value = EXCLUDED.value, source = EXCLUDED.source",
            (ts, ticker, value),
        )


class TestIntegrationAlertRulesEngine:
    """End-to-end: seed scores -> evaluate_rules() -> verify alert_state and alert_history."""

    def test_ac_consecutive_readings_fires_on_third(self, db_conn, db_url, alert_config):
        """AC: composite_critical fires after 3 consecutive readings > 75, not before.

        Seeds 3 readings above threshold, calls evaluate_rules() after each.
        Alert should fire only on the 3rd evaluation.
        """
        from alerting.rules_engine import evaluate_rules

        # Reading 1: score 80 > 75
        _seed_reading(db_conn, "SCORE_COMPOSITE", 80.0, time_offset_minutes=2)
        alerts = evaluate_rules(db_url, alert_config)
        composite_alerts = [a for a in alerts if a["rule_id"] == "composite_critical"]
        assert len(composite_alerts) == 0, "Should not fire after 1 reading"

        # Verify consecutive_count is 1
        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT consecutive_count FROM alert_state WHERE rule_id = 'composite_critical'"
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == 1

        # Reading 2: score 82 > 75
        _seed_reading(db_conn, "SCORE_COMPOSITE", 82.0, time_offset_minutes=1)
        alerts = evaluate_rules(db_url, alert_config)
        composite_alerts = [a for a in alerts if a["rule_id"] == "composite_critical"]
        assert len(composite_alerts) == 0, "Should not fire after 2 readings"

        # Reading 3: score 85 > 75 -> should fire
        _seed_reading(db_conn, "SCORE_COMPOSITE", 85.0, time_offset_minutes=0)
        alerts = evaluate_rules(db_url, alert_config)
        composite_alerts = [a for a in alerts if a["rule_id"] == "composite_critical"]
        assert len(composite_alerts) == 1, "Should fire after 3 consecutive readings"
        assert composite_alerts[0]["value"] == 85.0

        # Verify alert_history has exactly one entry
        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT rule_id, value, message, channels FROM alert_history "
                "WHERE rule_id = 'composite_critical'"
            )
            rows = cur.fetchall()
            assert len(rows) == 1
            assert rows[0][0] == "composite_critical"
            assert rows[0][1] == 85.0

    def test_ac_consecutive_count_resets_when_condition_not_met(self, db_conn, db_url, alert_config):
        """AC: When a rule condition is no longer met, consecutive_count resets to 0."""
        from alerting.rules_engine import evaluate_rules

        # Reading above threshold
        _seed_reading(db_conn, "SCORE_COMPOSITE", 80.0, time_offset_minutes=1)
        evaluate_rules(db_url, alert_config)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT consecutive_count FROM alert_state WHERE rule_id = 'composite_critical'"
            )
            assert cur.fetchone()[0] == 1

        # Reading below threshold -- should reset
        _seed_reading(db_conn, "SCORE_COMPOSITE", 50.0, time_offset_minutes=0)
        evaluate_rules(db_url, alert_config)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT consecutive_count FROM alert_state WHERE rule_id = 'composite_critical'"
            )
            assert cur.fetchone()[0] == 0

    def test_ac_cooldown_prevents_refire(self, db_conn, db_url, alert_config):
        """AC: Same alert does not re-fire within the cooldown period."""
        from alerting.rules_engine import evaluate_rules

        # Fire the vix_spike rule (consecutive_readings=1)
        _seed_reading(db_conn, "VIXY", 35.0, time_offset_minutes=1)
        alerts = evaluate_rules(db_url, alert_config)
        vix_alerts = [a for a in alerts if a["rule_id"] == "vix_spike"]
        assert len(vix_alerts) == 1, "VIX alert should fire on first reading"

        # Second evaluation within cooldown -- should not fire
        _seed_reading(db_conn, "VIXY", 36.0, time_offset_minutes=0)
        alerts = evaluate_rules(db_url, alert_config)
        vix_alerts = [a for a in alerts if a["rule_id"] == "vix_spike"]
        assert len(vix_alerts) == 0, "Should not re-fire within cooldown"

        # Verify only one alert_history entry
        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM alert_history WHERE rule_id = 'vix_spike'"
            )
            assert cur.fetchone()[0] == 1

    def test_ac_cooldown_expired_allows_refire(self, db_conn, db_url, alert_config):
        """AC: After cooldown expires, alert can fire again."""
        from alerting.rules_engine import evaluate_rules

        # Fire VIX alert
        _seed_reading(db_conn, "VIXY", 35.0, time_offset_minutes=0)
        evaluate_rules(db_url, alert_config)

        # Manually set last_triggered to 5 hours ago (cooldown is 4h)
        five_hours_ago = datetime.now(timezone.utc) - timedelta(hours=5)
        with db_conn.cursor() as cur:
            cur.execute(
                "UPDATE alert_state SET last_triggered = %s WHERE rule_id = 'vix_spike'",
                (five_hours_ago,),
            )

        # New reading should fire again
        _seed_reading(db_conn, "VIXY", 40.0, time_offset_minutes=0)
        alerts = evaluate_rules(db_url, alert_config)
        vix_alerts = [a for a in alerts if a["rule_id"] == "vix_spike"]
        assert len(vix_alerts) == 1, "Should fire after cooldown expires"

    def test_ac_alert_history_records_all_fields(self, db_conn, db_url, alert_config):
        """AC: alert_history records fired alert with timestamp, value, message, channels."""
        from alerting.rules_engine import evaluate_rules

        _seed_reading(db_conn, "VIXY", 35.0, time_offset_minutes=0)
        evaluate_rules(db_url, alert_config)

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT rule_id, triggered_at, value, message, channels, delivered "
                "FROM alert_history WHERE rule_id = 'vix_spike'"
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == "vix_spike"  # rule_id
            assert row[1] is not None  # triggered_at
            assert row[2] == pytest.approx(35.0, abs=0.1)  # value
            assert "VIXY" in row[3]  # message contains ticker
            assert "slack" in row[4]  # channels
            assert row[5] is False  # delivered

    def test_contagion_rule_fires_after_two_readings(self, db_conn, db_url, alert_config):
        """contagion_spike has consecutive_readings=2, should fire on 2nd reading."""
        from alerting.rules_engine import evaluate_rules

        _seed_reading(db_conn, "SCORE_CONTAGION", 0.6, time_offset_minutes=1)
        alerts = evaluate_rules(db_url, alert_config)
        contagion_alerts = [a for a in alerts if a["rule_id"] == "contagion_spike"]
        assert len(contagion_alerts) == 0

        _seed_reading(db_conn, "SCORE_CONTAGION", 0.7, time_offset_minutes=0)
        alerts = evaluate_rules(db_url, alert_config)
        contagion_alerts = [a for a in alerts if a["rule_id"] == "contagion_spike"]
        assert len(contagion_alerts) == 1

    def test_ac_same_value_does_not_increment_consecutive_count(self, db_conn, db_url, alert_config):
        """AC: Seeding the same value multiple times does not increment consecutive_count.

        The rules engine only increments consecutive_count when the value changes,
        treating repeated identical values as the same reading. Three identical
        readings should leave consecutive_count at 1 and the rule should not fire.
        """
        from alerting.rules_engine import evaluate_rules

        # Seed 3 identical readings above threshold (composite_critical needs 3)
        _seed_reading(db_conn, "SCORE_COMPOSITE", 80.0, time_offset_minutes=2)
        evaluate_rules(db_url, alert_config)

        _seed_reading(db_conn, "SCORE_COMPOSITE", 80.0, time_offset_minutes=1)
        evaluate_rules(db_url, alert_config)

        _seed_reading(db_conn, "SCORE_COMPOSITE", 80.0, time_offset_minutes=0)
        alerts = evaluate_rules(db_url, alert_config)

        # consecutive_count should stay at 1 since the value never changed
        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT consecutive_count FROM alert_state WHERE rule_id = 'composite_critical'"
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] == 1, (
                f"Expected consecutive_count=1 for repeated identical values, got {row[0]}"
            )

        # Alert should NOT have fired (needs 3, only counted 1)
        composite_alerts = [a for a in alerts if a["rule_id"] == "composite_critical"]
        assert len(composite_alerts) == 0, "Same-value readings should not reach consecutive threshold"

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM alert_history WHERE rule_id = 'composite_critical'"
            )
            assert cur.fetchone()[0] == 0

    def test_no_data_does_not_fire(self, db_conn, db_url, alert_config):
        """When no time_series data exists for a ticker, no alert fires."""
        from alerting.rules_engine import evaluate_rules

        alerts = evaluate_rules(db_url, alert_config)
        assert len(alerts) == 0
