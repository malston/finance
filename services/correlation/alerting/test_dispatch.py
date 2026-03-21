"""Tests for alert dispatch to email, Slack, and browser push channels.

Tests dispatch orchestration, per-channel error isolation, email formatting,
Slack payload structure, and alert_history delivery updates.
"""

import json
from unittest.mock import MagicMock, patch

import pytest
import responses

from alerting.dispatch import dispatch_alert
from alerting.channels.email import send_email, format_email_html
from alerting.channels.slack import send_slack, format_slack_payload
from alerting.channels.push import send_push


# -- Fixtures --


@pytest.fixture
def sample_alert():
    """A fired alert dict as produced by evaluate_rules."""
    return {
        "rule_id": "composite_critical",
        "value": 82.5,
        "message": (
            "Composite threat CRITICAL: SCORE_COMPOSITE = 82.5 "
            "(> 75 for 3 consecutive readings)"
        ),
        "channels": ["email", "slack", "browser_push"],
    }


@pytest.fixture
def channels_config():
    """Channel configuration dict."""
    return {
        "email": {
            "enabled": True,
            "recipients": ["alerts@example.com", "team@example.com"],
            "from_address": "noreply@example.com",
            "api_key": "test-sendgrid-key-123",
        },
        "slack": {
            "enabled": True,
            "webhook_url": "https://hooks.slack.com/services/T00/B00/xxx",
        },
        "browser_push": {
            "enabled": False,
        },
    }


# -- Email Channel Tests --


class TestFormatEmailHtml:
    """Test email HTML formatting."""

    def test_subject_contains_rule_id(self, sample_alert):
        subject, _body = format_email_html(sample_alert)
        assert "composite_critical" in subject

    def test_subject_starts_with_risk_alert_prefix(self, sample_alert):
        subject, _body = format_email_html(sample_alert)
        assert subject.startswith("[RISK ALERT]")

    def test_body_contains_alert_message(self, sample_alert):
        _subject, body = format_email_html(sample_alert)
        assert "82.5" in body
        assert "Composite threat CRITICAL" in body

    def test_body_is_html(self, sample_alert):
        _subject, body = format_email_html(sample_alert)
        assert "<html>" in body.lower() or "<div>" in body.lower()


class TestSendEmail:
    """Test email dispatch via HTTP API."""

    @responses.activate
    def test_send_email_posts_to_sendgrid(self, sample_alert, channels_config):
        responses.add(
            responses.POST,
            "https://api.sendgrid.com/v3/mail/send",
            status=202,
        )
        result = send_email(sample_alert, channels_config["email"])
        assert result is True
        assert len(responses.calls) == 1
        req = responses.calls[0].request
        assert req.headers["Authorization"] == "Bearer test-sendgrid-key-123"

    @responses.activate
    def test_send_email_includes_recipients(self, sample_alert, channels_config):
        responses.add(
            responses.POST,
            "https://api.sendgrid.com/v3/mail/send",
            status=202,
        )
        send_email(sample_alert, channels_config["email"])
        body = json.loads(responses.calls[0].request.body)
        to_emails = [
            p["email"]
            for p in body["personalizations"][0]["to"]
        ]
        assert "alerts@example.com" in to_emails
        assert "team@example.com" in to_emails

    @responses.activate
    def test_send_email_returns_false_on_failure(self, sample_alert, channels_config):
        responses.add(
            responses.POST,
            "https://api.sendgrid.com/v3/mail/send",
            status=500,
            body="Internal Server Error",
        )
        result = send_email(sample_alert, channels_config["email"])
        assert result is False


# -- Slack Channel Tests --


class TestFormatSlackPayload:
    """Test Slack Block Kit message formatting."""

    def test_payload_has_attachments(self, sample_alert):
        payload = format_slack_payload(sample_alert)
        assert "attachments" in payload

    def test_attachment_color_for_high_value(self, sample_alert):
        payload = format_slack_payload(sample_alert)
        color = payload["attachments"][0]["color"]
        # 82.5 > 75: should be danger/red
        assert color == "#dc3545"

    def test_attachment_contains_rule_info(self, sample_alert):
        payload = format_slack_payload(sample_alert)
        text = json.dumps(payload)
        assert "composite_critical" in text
        assert "82.5" in text

    def test_low_value_alert_uses_warning_color(self):
        alert = {
            "rule_id": "vix_spike",
            "value": 32.0,
            "message": "VIX above 30: VIX = 32.0 (> 30 for 1 consecutive readings)",
            "channels": ["slack"],
        }
        payload = format_slack_payload(alert)
        color = payload["attachments"][0]["color"]
        # 32 < 75: should be warning/yellow
        assert color == "#ffc107"


class TestSendSlack:
    """Test Slack webhook dispatch."""

    @responses.activate
    def test_send_slack_posts_to_webhook(self, sample_alert, channels_config):
        webhook = channels_config["slack"]["webhook_url"]
        responses.add(responses.POST, webhook, status=200, body="ok")
        result = send_slack(sample_alert, channels_config["slack"])
        assert result is True
        assert len(responses.calls) == 1

    @responses.activate
    def test_send_slack_payload_is_block_kit(self, sample_alert, channels_config):
        webhook = channels_config["slack"]["webhook_url"]
        responses.add(responses.POST, webhook, status=200, body="ok")
        send_slack(sample_alert, channels_config["slack"])
        body = json.loads(responses.calls[0].request.body)
        assert "attachments" in body

    @responses.activate
    def test_send_slack_returns_false_on_failure(self, sample_alert, channels_config):
        webhook = channels_config["slack"]["webhook_url"]
        responses.add(responses.POST, webhook, status=500)
        result = send_slack(sample_alert, channels_config["slack"])
        assert result is False


# -- Browser Push Channel Tests --


class TestSendPush:
    """Test browser push notification dispatch."""

    def test_send_push_returns_false_when_disabled(self, sample_alert):
        config = {"enabled": False}
        result = send_push(sample_alert, config)
        assert result is False

    def test_send_push_returns_false_when_no_subscriptions(self, sample_alert):
        config = {
            "enabled": True,
            "vapid_public_key": "test-pub-key",
            "vapid_private_key": "test-priv-key",
            "vapid_claims_email": "admin@example.com",
            "subscriptions": [],
        }
        result = send_push(sample_alert, config)
        assert result is False

    def test_send_push_returns_true_with_subscriptions(self, sample_alert):
        config = {
            "enabled": True,
            "vapid_public_key": "test-pub-key",
            "vapid_private_key": "test-priv-key",
            "vapid_claims_email": "admin@example.com",
            "subscriptions": [
                {
                    "endpoint": "https://push.example.com/sub1",
                    "keys": {"p256dh": "key1", "auth": "auth1"},
                }
            ],
        }
        with patch("alerting.channels.push._send_web_push", return_value=True):
            result = send_push(sample_alert, config)
        assert result is True


# -- Dispatch Orchestrator Tests --


class TestDispatchAlert:
    """Test the top-level dispatch_alert function."""

    @responses.activate
    def test_dispatches_to_all_enabled_channels(self, sample_alert, channels_config):
        # Email endpoint
        responses.add(
            responses.POST,
            "https://api.sendgrid.com/v3/mail/send",
            status=202,
        )
        # Slack endpoint
        webhook = channels_config["slack"]["webhook_url"]
        responses.add(responses.POST, webhook, status=200, body="ok")

        result = dispatch_alert(sample_alert, channels_config)
        assert result["email"] is True
        assert result["slack"] is True
        # browser_push is disabled in config
        assert result["browser_push"] is False

    @responses.activate
    def test_channel_failure_does_not_block_others(self, sample_alert, channels_config):
        # Email fails
        responses.add(
            responses.POST,
            "https://api.sendgrid.com/v3/mail/send",
            status=500,
        )
        # Slack succeeds
        webhook = channels_config["slack"]["webhook_url"]
        responses.add(responses.POST, webhook, status=200, body="ok")

        result = dispatch_alert(sample_alert, channels_config)
        assert result["email"] is False
        assert result["slack"] is True

    def test_no_channels_configured_returns_empty(self):
        alert = {
            "rule_id": "test",
            "value": 1.0,
            "message": "test",
            "channels": [],
        }
        result = dispatch_alert(alert, {})
        assert result == {}

    def test_unknown_channel_returns_false(self, sample_alert):
        alert = {**sample_alert, "channels": ["carrier_pigeon"]}
        result = dispatch_alert(alert, {})
        assert result["carrier_pigeon"] is False

    @responses.activate
    def test_only_dispatches_to_channels_in_alert(self, channels_config):
        """Alert with only slack channel should not dispatch email."""
        alert = {
            "rule_id": "vix_spike",
            "value": 32.0,
            "message": "VIX above 30",
            "channels": ["slack"],
        }
        webhook = channels_config["slack"]["webhook_url"]
        responses.add(responses.POST, webhook, status=200, body="ok")

        result = dispatch_alert(alert, channels_config)
        assert "email" not in result
        assert result["slack"] is True

    @responses.activate
    def test_dispatch_returns_at_least_one_success(self, sample_alert, channels_config):
        """Verify we can check if at least one channel succeeded."""
        responses.add(
            responses.POST,
            "https://api.sendgrid.com/v3/mail/send",
            status=202,
        )
        webhook = channels_config["slack"]["webhook_url"]
        responses.add(responses.POST, webhook, status=200, body="ok")

        result = dispatch_alert(sample_alert, channels_config)
        assert any(result.values())
