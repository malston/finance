"""Unit tests for alert rules engine.

Tests rule parsing, condition evaluation, consecutive count tracking,
cooldown enforcement, and alert firing logic.
"""

import os
from datetime import datetime, timedelta, timezone

import psycopg2
import pytest
import yaml


# Load config from the alert_config.yaml
CONFIG_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)),
    "alert_config.yaml",
)


@pytest.fixture(scope="module")
def alert_config():
    """Load alert config from YAML."""
    with open(CONFIG_PATH) as f:
        return yaml.safe_load(f)


class TestLoadAlertConfig:
    """Test loading and parsing alert rules from YAML."""

    def test_load_config_returns_rules(self, alert_config):
        from alerting.rules_engine import load_alert_config

        config = load_alert_config(CONFIG_PATH)
        assert "alerts" in config
        assert "rules" in config["alerts"]
        assert len(config["alerts"]["rules"]) == 3

    def test_each_rule_has_required_fields(self, alert_config):
        from alerting.rules_engine import load_alert_config

        config = load_alert_config(CONFIG_PATH)
        required = {"id", "name", "ticker", "threshold", "operator",
                     "consecutive_readings", "cooldown"}
        for rule in config["alerts"]["rules"]:
            missing = required - set(rule.keys())
            assert not missing, f"Rule {rule.get('id', '?')} missing: {missing}"


class TestParseCooldown:
    """Test cooldown string parsing to timedelta."""

    def test_parse_hours(self):
        from alerting.rules_engine import parse_cooldown

        assert parse_cooldown("4h") == timedelta(hours=4)

    def test_parse_minutes(self):
        from alerting.rules_engine import parse_cooldown

        assert parse_cooldown("30m") == timedelta(minutes=30)

    def test_parse_days(self):
        from alerting.rules_engine import parse_cooldown

        assert parse_cooldown("1d") == timedelta(days=1)

    def test_invalid_format_raises(self):
        from alerting.rules_engine import parse_cooldown

        with pytest.raises(ValueError):
            parse_cooldown("abc")


class TestEvaluateCondition:
    """Test threshold condition evaluation."""

    def test_greater_than_true(self):
        from alerting.rules_engine import evaluate_condition

        assert evaluate_condition(80.0, ">", 75.0) is True

    def test_greater_than_false(self):
        from alerting.rules_engine import evaluate_condition

        assert evaluate_condition(70.0, ">", 75.0) is False

    def test_greater_than_equal_boundary(self):
        from alerting.rules_engine import evaluate_condition

        assert evaluate_condition(75.0, ">", 75.0) is False

    def test_less_than(self):
        from alerting.rules_engine import evaluate_condition

        assert evaluate_condition(10.0, "<", 20.0) is True

    def test_greater_equal(self):
        from alerting.rules_engine import evaluate_condition

        assert evaluate_condition(75.0, ">=", 75.0) is True

    def test_less_equal(self):
        from alerting.rules_engine import evaluate_condition

        assert evaluate_condition(75.0, "<=", 75.0) is True

    def test_equal(self):
        from alerting.rules_engine import evaluate_condition

        assert evaluate_condition(75.0, "==", 75.0) is True

    def test_unsupported_operator_raises(self):
        from alerting.rules_engine import evaluate_condition

        with pytest.raises(ValueError):
            evaluate_condition(75.0, "!=", 75.0)
