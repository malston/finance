"""Slack webhook alert dispatch with Block Kit formatting."""

import json
import logging

import requests

logger = logging.getLogger(__name__)

# Threat level color thresholds
COLOR_DANGER = "#dc3545"   # Red: value >= 75
COLOR_WARNING = "#ffc107"  # Yellow: value < 75


def format_slack_payload(alert: dict) -> dict:
    """Format alert as a Slack Block Kit message with color-coded attachment.

    Args:
        alert: Fired alert dict with rule_id, value, message, channels.

    Returns:
        Slack message payload dict with attachments.
    """
    color = COLOR_DANGER if alert["value"] >= 75 else COLOR_WARNING

    return {
        "attachments": [
            {
                "color": color,
                "fallback": alert["message"],
                "title": f"Risk Alert: {alert['rule_id']}",
                "text": alert["message"],
                "fields": [
                    {
                        "title": "Rule",
                        "value": alert["rule_id"],
                        "short": True,
                    },
                    {
                        "title": "Value",
                        "value": str(alert["value"]),
                        "short": True,
                    },
                ],
            }
        ],
    }


def send_slack(alert: dict, config: dict) -> bool:
    """Send alert to Slack via webhook.

    Args:
        alert: Fired alert dict.
        config: Slack channel config with webhook_url.

    Returns:
        True if the webhook accepted the payload, False otherwise.
    """
    payload = format_slack_payload(alert)

    try:
        resp = requests.post(
            config["webhook_url"],
            data=json.dumps(payload),
            headers={"Content-Type": "application/json"},
            timeout=10,
        )
        if resp.status_code == 200:
            logger.info("Slack alert sent for %s", alert["rule_id"])
            return True
        logger.warning(
            "Slack send failed for %s: HTTP %d",
            alert["rule_id"],
            resp.status_code,
        )
        return False
    except requests.RequestException:
        logger.exception("Slack send error for %s", alert["rule_id"])
        return False
