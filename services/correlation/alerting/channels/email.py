"""Email alert dispatch via SendGrid API."""

import json
import logging

import requests

logger = logging.getLogger(__name__)

SENDGRID_URL = "https://api.sendgrid.com/v3/mail/send"


def format_email_html(alert: dict) -> tuple[str, str]:
    """Format alert as HTML email with subject line.

    Args:
        alert: Fired alert dict with rule_id, value, message, channels.

    Returns:
        Tuple of (subject, html_body).
    """
    subject = f"[RISK ALERT] {alert['rule_id']} - value {alert['value']}"
    body = (
        "<html><body>"
        f"<h2>Risk Alert: {alert['rule_id']}</h2>"
        f"<p>{alert['message']}</p>"
        f"<p><strong>Current Value:</strong> {alert['value']}</p>"
        "</body></html>"
    )
    return subject, body


def send_email(alert: dict, config: dict) -> bool:
    """Send alert email via SendGrid API.

    Args:
        alert: Fired alert dict.
        config: Email channel config with api_key, recipients, from_address.

    Returns:
        True if the API accepted the request, False otherwise.
    """
    subject, html_body = format_email_html(alert)

    payload = {
        "personalizations": [
            {
                "to": [{"email": r} for r in config["recipients"]],
                "subject": subject,
            }
        ],
        "from": {"email": config["from_address"]},
        "content": [{"type": "text/html", "value": html_body}],
    }

    headers = {
        "Authorization": f"Bearer {config['api_key']}",
        "Content-Type": "application/json",
    }

    try:
        resp = requests.post(
            SENDGRID_URL,
            headers=headers,
            data=json.dumps(payload),
            timeout=10,
        )
        if resp.status_code in (200, 202):
            logger.info("Email sent for alert %s", alert["rule_id"])
            return True
        logger.warning(
            "Email send failed for %s: HTTP %d",
            alert["rule_id"],
            resp.status_code,
        )
        return False
    except requests.RequestException:
        logger.exception("Email send error for %s", alert["rule_id"])
        return False
