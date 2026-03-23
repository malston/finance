"""Unit tests for market-hours detection and staleness policy functions."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from scoring.common import get_staleness_hours, is_market_hours, validate_staleness_config


ET = ZoneInfo("America/New_York")

STALENESS_CONFIG = {
    "staleness": {
        "market_hours_max_age": 2,
        "off_hours_max_age": 66,
        "market_open": "09:30",
        "market_close": "16:00",
        "market_days": [0, 1, 2, 3, 4],
    }
}


def _make_dt(year, month, day, hour, minute, tz=ET):
    """Build a timezone-aware datetime."""
    return datetime(year, month, day, hour, minute, tzinfo=tz)


class TestIsMarketHours:
    """Market hours boundary tests using America/New_York."""

    def test_weekday_during_market_hours(self):
        # Wednesday 10:00 AM ET
        assert is_market_hours(STALENESS_CONFIG, now=_make_dt(2026, 3, 18, 10, 0)) is True

    def test_weekday_before_market_open(self):
        # Wednesday 9:29 AM ET
        assert is_market_hours(STALENESS_CONFIG, now=_make_dt(2026, 3, 18, 9, 29)) is False

    def test_weekday_at_market_open(self):
        # Wednesday 9:30 AM ET -- inclusive open
        assert is_market_hours(STALENESS_CONFIG, now=_make_dt(2026, 3, 18, 9, 30)) is True

    def test_weekday_at_market_close(self):
        # Wednesday 4:00 PM ET -- exclusive close
        assert is_market_hours(STALENESS_CONFIG, now=_make_dt(2026, 3, 18, 16, 0)) is False

    def test_weekday_after_market_close(self):
        # Wednesday 6:00 PM ET
        assert is_market_hours(STALENESS_CONFIG, now=_make_dt(2026, 3, 18, 18, 0)) is False

    def test_saturday(self):
        # Saturday 10:00 AM ET
        assert is_market_hours(STALENESS_CONFIG, now=_make_dt(2026, 3, 21, 10, 0)) is False

    def test_sunday(self):
        # Sunday 3:00 PM ET
        assert is_market_hours(STALENESS_CONFIG, now=_make_dt(2026, 3, 22, 15, 0)) is False

    def test_missing_staleness_config_returns_true(self):
        """Backward compat: no staleness block -> assume market hours."""
        assert is_market_hours({"scoring": {}}) is True

    def test_utc_input_converts_to_et(self):
        """UTC timestamps are converted to ET for market hours check."""
        # Monday 14:30 UTC = 10:30 AM ET (during EDT) -> market hours
        assert is_market_hours(
            STALENESS_CONFIG,
            now=datetime(2026, 3, 23, 14, 30, tzinfo=timezone.utc),
        ) is True

    def test_utc_input_before_market_open(self):
        """UTC timestamp before market open in ET."""
        # Monday 13:00 UTC = 9:00 AM ET -> before market open
        assert is_market_hours(
            STALENESS_CONFIG,
            now=datetime(2026, 3, 23, 13, 0, tzinfo=timezone.utc),
        ) is False


class TestGetStalenessHours:
    """Staleness hours vary by market schedule."""

    def test_market_hours_returns_tight_window(self):
        assert get_staleness_hours(STALENESS_CONFIG, now=_make_dt(2026, 3, 18, 10, 0)) == 2

    def test_off_hours_returns_relaxed_window(self):
        assert get_staleness_hours(STALENESS_CONFIG, now=_make_dt(2026, 3, 21, 10, 0)) == 66

    def test_missing_staleness_config_returns_default(self):
        """Backward compat: no staleness block -> 2.0."""
        assert get_staleness_hours({"scoring": {}}) == 2.0

    def test_partial_config_uses_defaults(self):
        """Missing sub-keys fall back to safe defaults."""
        config = {"staleness": {"off_hours_max_age": 72}}
        # Saturday -- off-hours
        assert get_staleness_hours(config, now=_make_dt(2026, 3, 21, 10, 0)) == 72

    def test_partial_config_market_hours_defaults_to_2(self):
        """Missing market_hours_max_age defaults to 2."""
        config = {"staleness": {"off_hours_max_age": 72}}
        # Wednesday 10 AM -- market hours
        assert get_staleness_hours(config, now=_make_dt(2026, 3, 18, 10, 0)) == 2

    def test_partial_config_off_hours_defaults_to_48(self):
        """Missing off_hours_max_age defaults to 48."""
        config = {"staleness": {"market_hours_max_age": 2}}
        # Saturday -- off-hours
        assert get_staleness_hours(config, now=_make_dt(2026, 3, 21, 10, 0)) == 48


class TestValidateStalenessConfig:
    """Validation catches malformed staleness config at startup."""

    def test_valid_config_passes(self):
        validate_staleness_config(STALENESS_CONFIG)

    def test_missing_staleness_block_logs_warning(self, caplog):
        validate_staleness_config({"scoring": {}})
        assert "No 'staleness' block" in caplog.text

    def test_malformed_market_open_raises(self):
        config = {"staleness": {"market_open": "9:30 AM"}}
        with pytest.raises(ValueError, match="staleness.market_open must be HH:MM"):
            validate_staleness_config(config)

    def test_malformed_market_close_raises(self):
        config = {"staleness": {"market_close": "four"}}
        with pytest.raises(ValueError, match="staleness.market_close must be HH:MM"):
            validate_staleness_config(config)

    def test_invalid_hour_raises(self):
        config = {"staleness": {"market_open": "25:00"}}
        with pytest.raises(ValueError, match="staleness.market_open must be HH:MM"):
            validate_staleness_config(config)

    def test_missing_keys_passes(self):
        """Config with staleness block but no open/close is valid (uses defaults)."""
        validate_staleness_config({"staleness": {"market_hours_max_age": 2}})
