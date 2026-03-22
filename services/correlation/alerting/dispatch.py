"""Alert dispatch orchestration across email, Slack, and browser push.

Routes fired alerts to configured channels. Each channel dispatches
independently -- a failure in one does not block the others.
"""

import logging
from typing import Any

from alerting.channels.email import send_email
from alerting.channels.slack import send_slack
from alerting.channels.push import send_push

logger = logging.getLogger(__name__)

CHANNEL_HANDLERS = {
    "email": send_email,
    "slack": send_slack,
    "browser_push": send_push,
}


def dispatch_alert(
    alert: dict[str, Any],
    channels_config: dict[str, Any],
) -> dict[str, bool | None]:
    """Dispatch a fired alert to all channels listed in the alert.

    Only dispatches to channels that appear in the alert's channels list.
    Each channel is tried independently; failures are logged but do not
    prevent other channels from being attempted.

    Args:
        alert: Fired alert dict with rule_id, value, message, channels.
        channels_config: Per-channel configuration keyed by channel name.

    Returns:
        Dict mapping channel name to True (success), False (failed), or
        None (disabled/skipped).
    """
    results: dict[str, bool | None] = {}

    for channel_name in alert.get("channels", []):
        handler = CHANNEL_HANDLERS.get(channel_name)
        if handler is None:
            logger.warning("Unknown dispatch channel: %s", channel_name)
            results[channel_name] = False
            continue

        config = channels_config.get(channel_name, {})
        if not config.get("enabled", False):
            logger.debug("Channel %s is disabled, skipping", channel_name)
            results[channel_name] = None
            continue

        try:
            results[channel_name] = handler(alert, config)
        except Exception:
            logger.exception(
                "Dispatch to %s failed for alert %s",
                channel_name,
                alert.get("rule_id"),
            )
            results[channel_name] = False

    return results


def update_delivery_status(
    conn,
    rule_id: str,
    channel_results: dict[str, bool],
) -> None:
    """Update alert_history to record delivery status.

    Sets delivered=true if at least one channel succeeded.

    Args:
        conn: psycopg2 database connection.
        rule_id: The rule_id of the alert to update.
        channel_results: Dict mapping channel name to success boolean.
    """
    successful = [ch for ch, ok in channel_results.items() if ok]
    delivered = len(successful) > 0

    with conn.cursor() as cur:
        cur.execute(
            "UPDATE alert_history "
            "SET delivered = %s "
            "WHERE rule_id = %s "
            "AND id = (SELECT MAX(id) FROM alert_history WHERE rule_id = %s)",
            (delivered, rule_id, rule_id),
        )
    conn.commit()
