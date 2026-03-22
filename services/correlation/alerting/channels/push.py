"""Browser push notification dispatch via Web Push protocol.

Sends push notifications to subscribed browsers. Subscriptions are passed
in the config dict rather than stored in a database, keeping this module
stateless and testable.
"""

import json
import logging

logger = logging.getLogger(__name__)


def _send_web_push(subscription: dict, data: str, vapid_config: dict) -> bool:
    """Send a single web push notification.

    This is the low-level push sender. In production this would use
    pywebpush or a direct Web Push protocol implementation. Extracted
    to allow test patching without mocking the entire module.

    Args:
        subscription: Push subscription with endpoint and keys.
        data: JSON string payload.
        vapid_config: VAPID key configuration.

    Returns:
        True on success, False on failure.
    """
    try:
        from pywebpush import webpush
    except ImportError:
        logger.warning(
            "pywebpush not installed; browser push disabled for endpoint %s",
            subscription.get("endpoint"),
        )
        return False

    try:
        webpush(
            subscription_info=subscription,
            data=data,
            vapid_private_key=vapid_config["private_key"],
            vapid_claims={"sub": f"mailto:{vapid_config['email']}"},
        )
        return True
    except Exception:
        logger.exception(
            "Web push failed for endpoint %s", subscription.get("endpoint")
        )
        return False


def send_push(alert: dict, config: dict) -> bool:
    """Send browser push notifications for an alert.

    Args:
        alert: Fired alert dict with rule_id, value, message.
        config: Browser push config with enabled, subscriptions, VAPID keys.

    Returns:
        True if at least one subscription was notified, False otherwise.
    """
    if not config.get("enabled"):
        return False

    subscriptions = config.get("subscriptions", [])
    if not subscriptions:
        return False

    vapid_config = {
        "public_key": config["vapid_public_key"],
        "private_key": config["vapid_private_key"],
        "email": config["vapid_claims_email"],
    }

    data = json.dumps({
        "title": f"Risk Alert: {alert['rule_id']}",
        "body": alert["message"],
        "value": alert["value"],
    })

    any_success = False
    for sub in subscriptions:
        if _send_web_push(sub, data, vapid_config):
            any_success = True

    return any_success
