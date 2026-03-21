"""Alert rules engine for threshold-based rule evaluation.

Evaluates configurable alert rules against time_series data, tracks
consecutive readings in alert_state, enforces cooldown periods, and
writes fired alerts to alert_history.
"""

import logging
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import psycopg2
import yaml

logger = logging.getLogger(__name__)


def load_alert_config(config_path: str) -> dict[str, Any]:
    """Load alert rules configuration from a YAML file.

    Args:
        config_path: Path to the alert_config.yaml file.

    Returns:
        Parsed config dict with 'alerts.rules' list.
    """
    with open(config_path) as f:
        return yaml.safe_load(f)


def parse_cooldown(cooldown_str: str) -> timedelta:
    """Parse a cooldown duration string into a timedelta.

    Supports formats: '4h' (hours), '30m' (minutes), '1d' (days).

    Args:
        cooldown_str: Duration string like '4h', '30m', '1d'.

    Returns:
        Corresponding timedelta.

    Raises:
        ValueError: If the format is not recognized.
    """
    match = re.match(r"^(\d+)([hmd])$", cooldown_str)
    if not match:
        raise ValueError(
            f"Invalid cooldown format: '{cooldown_str}'. "
            "Expected format like '4h', '30m', or '1d'."
        )
    amount = int(match.group(1))
    unit = match.group(2)
    if unit == "h":
        return timedelta(hours=amount)
    elif unit == "m":
        return timedelta(minutes=amount)
    elif unit == "d":
        return timedelta(days=amount)
    raise ValueError(f"Unhandled unit: {unit}")


def evaluate_condition(value: float, operator: str, threshold: float) -> bool:
    """Evaluate a comparison condition.

    Args:
        value: The current reading value.
        operator: One of '>', '<', '>=', '<=', '=='.
        threshold: The threshold to compare against.

    Returns:
        True if the condition is met.

    Raises:
        ValueError: If the operator is not supported.
    """
    ops = {
        ">": lambda v, t: v > t,
        "<": lambda v, t: v < t,
        ">=": lambda v, t: v >= t,
        "<=": lambda v, t: v <= t,
        "==": lambda v, t: v == t,
    }
    if operator not in ops:
        raise ValueError(f"Unsupported operator: '{operator}'")
    return ops[operator](value, threshold)


def _ensure_tables(conn: psycopg2.extensions.connection) -> None:
    """Create alert_state and alert_history tables if they don't exist."""
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
    conn.commit()


def _get_latest_value(
    conn: psycopg2.extensions.connection,
    ticker: str,
) -> float | None:
    """Fetch the most recent value for a ticker from time_series."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT value FROM time_series "
            "WHERE ticker = %s "
            "ORDER BY time DESC LIMIT 1",
            (ticker,),
        )
        row = cur.fetchone()
    return row[0] if row else None


def _get_alert_state(
    conn: psycopg2.extensions.connection,
    rule_id: str,
) -> dict[str, Any] | None:
    """Fetch the current alert state for a rule."""
    with conn.cursor() as cur:
        cur.execute(
            "SELECT consecutive_count, last_triggered, last_value "
            "FROM alert_state WHERE rule_id = %s",
            (rule_id,),
        )
        row = cur.fetchone()
    if row is None:
        return None
    return {
        "consecutive_count": row[0],
        "last_triggered": row[1],
        "last_value": row[2],
    }


def _upsert_alert_state(
    conn: psycopg2.extensions.connection,
    rule_id: str,
    consecutive_count: int,
    last_triggered: datetime | None,
    last_value: float | None,
) -> None:
    """Insert or update the alert_state row for a rule."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO alert_state (rule_id, consecutive_count, last_triggered, last_value) "
            "VALUES (%s, %s, %s, %s) "
            "ON CONFLICT (rule_id) DO UPDATE SET "
            "consecutive_count = EXCLUDED.consecutive_count, "
            "last_triggered = EXCLUDED.last_triggered, "
            "last_value = EXCLUDED.last_value",
            (rule_id, consecutive_count, last_triggered, last_value),
        )
    conn.commit()


def _write_alert_history(
    conn: psycopg2.extensions.connection,
    rule_id: str,
    value: float,
    message: str,
    channels: list[str],
) -> None:
    """Write a fired alert to alert_history."""
    with conn.cursor() as cur:
        cur.execute(
            "INSERT INTO alert_history (rule_id, triggered_at, value, message, channels) "
            "VALUES (%s, %s, %s, %s, %s)",
            (rule_id, datetime.now(timezone.utc), value, message, channels),
        )
    conn.commit()


def evaluate_rules(
    db_url: str,
    config: dict[str, Any],
) -> list[dict[str, Any]]:
    """Evaluate all alert rules against current time_series data.

    For each rule:
    1. Read the latest value for the rule's ticker
    2. If condition met: increment consecutive_count
    3. If condition not met: reset consecutive_count to 0
    4. If consecutive_count >= consecutive_readings AND cooldown expired: fire alert

    Args:
        db_url: PostgreSQL/TimescaleDB connection string.
        config: Alert config dict with 'alerts.rules' list.

    Returns:
        List of fired alert dicts with keys: rule_id, value, message, channels.
    """
    conn = psycopg2.connect(db_url)
    try:
        _ensure_tables(conn)
        fired_alerts: list[dict[str, Any]] = []

        for rule in config["alerts"]["rules"]:
            rule_id = rule["id"]
            ticker = rule["ticker"]
            threshold = rule["threshold"]
            operator = rule["operator"]
            consecutive_needed = rule["consecutive_readings"]
            cooldown = parse_cooldown(rule["cooldown"])
            channels = rule.get("channels", [])

            value = _get_latest_value(conn, ticker)
            if value is None:
                continue

            state = _get_alert_state(conn, rule_id)
            current_count = state["consecutive_count"] if state else 0
            last_triggered = state["last_triggered"] if state else None

            condition_met = evaluate_condition(value, operator, threshold)

            if condition_met:
                current_count += 1
            else:
                current_count = 0

            now = datetime.now(timezone.utc)

            should_fire = (
                condition_met
                and current_count >= consecutive_needed
                and (
                    last_triggered is None
                    or (now - last_triggered) >= cooldown
                )
            )

            if should_fire:
                message = (
                    f"{rule['name']}: {ticker} = {value} "
                    f"({operator} {threshold} for {current_count} consecutive readings)"
                )
                _write_alert_history(conn, rule_id, value, message, channels)
                _upsert_alert_state(conn, rule_id, current_count, now, value)
                fired_alerts.append({
                    "rule_id": rule_id,
                    "value": value,
                    "message": message,
                    "channels": channels,
                })
                logger.info("Alert fired: %s (value=%.4f)", rule_id, value)
            else:
                _upsert_alert_state(
                    conn, rule_id, current_count, last_triggered, value,
                )

        return fired_alerts
    finally:
        conn.close()
