"""Tests for dispatch wiring into the rules engine and alert_history updates.

Tests that fired alerts get dispatched and that alert_history.delivered
is updated after successful dispatch.
"""

import json
from unittest.mock import patch

import pytest
import responses

from alerting.dispatch import dispatch_alert
from alerting.dispatch import update_delivery_status


class TestUpdateDeliveryStatus:
    """Test marking alert_history rows as delivered."""

    def test_update_marks_delivered_true(self):
        """Verify update_delivery_status sets delivered=true and records channels."""
        # Use a mock connection to verify the SQL is correct
        from unittest.mock import MagicMock

        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value.__enter__ = lambda s: cursor
        conn.cursor.return_value.__exit__ = lambda s, *a: None

        update_delivery_status(
            conn,
            rule_id="composite_critical",
            channel_results={"email": True, "slack": True, "browser_push": False},
        )

        cursor.execute.assert_called_once()
        sql = cursor.execute.call_args[0][0]
        params = cursor.execute.call_args[0][1]
        assert "delivered" in sql.lower()
        assert "alert_history" in sql.lower()
        assert params[0] is True  # delivered = True
        assert "email" in params[1]  # successful channels
        assert "slack" in params[1]
        assert "browser_push" not in params[1]
        assert params[2] == "composite_critical"

    def test_update_marks_not_delivered_when_all_fail(self):
        """When all channels fail, delivered stays false."""
        from unittest.mock import MagicMock

        conn = MagicMock()
        cursor = MagicMock()
        conn.cursor.return_value.__enter__ = lambda s: cursor
        conn.cursor.return_value.__exit__ = lambda s, *a: None

        update_delivery_status(
            conn,
            rule_id="vix_spike",
            channel_results={"slack": False},
        )

        params = cursor.execute.call_args[0][1]
        assert params[0] is False  # delivered = False


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
