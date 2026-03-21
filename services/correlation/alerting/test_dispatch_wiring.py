"""Tests for dispatch wiring into the rules engine and alert_history updates.

Tests that fired alerts get dispatched and that alert_history.delivered
is updated after successful dispatch.

Requires DATABASE_URL environment variable pointing to a TimescaleDB instance.
"""

import os

import psycopg2
import pytest
import responses

from alerting.dispatch import dispatch_alert, update_delivery_status


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
    with conn.cursor() as cur:
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
def clean_alert_history(db_conn):
    """Remove all alert_history rows before and after each test."""
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM alert_history")
    yield
    with db_conn.cursor() as cur:
        cur.execute("DELETE FROM alert_history")


def _seed_alert(db_conn, rule_id, value=80.0, message="test alert", channels=None):
    """Insert a test alert into alert_history and return its id."""
    if channels is None:
        channels = ["email", "slack"]
    with db_conn.cursor() as cur:
        cur.execute(
            "INSERT INTO alert_history (rule_id, value, message, channels) "
            "VALUES (%s, %s, %s, %s) RETURNING id",
            (rule_id, value, message, channels),
        )
        return cur.fetchone()[0]


class TestUpdateDeliveryStatus:
    """Test marking alert_history rows as delivered using a real DB."""

    def test_update_marks_delivered_true(self, db_conn):
        """Verify update_delivery_status sets delivered=true when at least one channel succeeds."""
        _seed_alert(db_conn, "composite_critical")

        update_delivery_status(
            db_conn,
            rule_id="composite_critical",
            channel_results={"email": True, "slack": True, "browser_push": False},
        )

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT delivered FROM alert_history WHERE rule_id = 'composite_critical' "
                "ORDER BY id DESC LIMIT 1"
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] is True

    def test_update_marks_not_delivered_when_all_fail(self, db_conn):
        """When all channels fail, delivered stays false."""
        _seed_alert(db_conn, "vix_spike")

        update_delivery_status(
            db_conn,
            rule_id="vix_spike",
            channel_results={"slack": False},
        )

        with db_conn.cursor() as cur:
            cur.execute(
                "SELECT delivered FROM alert_history WHERE rule_id = 'vix_spike' "
                "ORDER BY id DESC LIMIT 1"
            )
            row = cur.fetchone()
            assert row is not None
            assert row[0] is False


class TestDispatchAndRecord:
    """Test the combined dispatch + delivery recording flow."""

    @responses.activate
    def test_dispatch_returns_any_success_flag(self):
        """dispatch_alert result can determine if at least one channel succeeded."""
        responses.add(
            responses.POST,
            "https://api.sendgrid.com/v3/mail/send",
            status=202,
        )

        alert = {
            "rule_id": "test",
            "value": 80.0,
            "message": "test alert",
            "channels": ["email"],
        }
        config = {
            "email": {
                "enabled": True,
                "recipients": ["a@example.com"],
                "from_address": "b@example.com",
                "api_key": "key",
            },
        }
        result = dispatch_alert(alert, config)
        delivered = any(result.values())
        assert delivered is True

    @responses.activate
    def test_no_channels_means_not_delivered(self):
        """Alert with no channels should not count as delivered."""
        alert = {
            "rule_id": "test",
            "value": 80.0,
            "message": "test alert",
            "channels": [],
        }
        result = dispatch_alert(alert, {})
        delivered = any(result.values()) if result else False
        assert delivered is False
