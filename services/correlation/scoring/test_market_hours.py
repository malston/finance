"""Unit tests for market-hours detection and staleness policy functions."""

from datetime import datetime, time, timezone
from unittest.mock import patch
from zoneinfo import ZoneInfo

import pytest

from scoring.common import get_staleness_hours, is_market_hours


ET = ZoneInfo("America/New_York")

STALENESS_CONFIG = {
    "staleness": {
        "market_hours_max_age": 2,
        "off_hours_max_age": 48,
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
        with patch("scoring.common.datetime") as mock_dt:
            mock_dt.now.return_value = _make_dt(2026, 3, 18, 10, 0)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert is_market_hours(STALENESS_CONFIG) is True

    def test_weekday_before_market_open(self):
        # Wednesday 9:29 AM ET
        with patch("scoring.common.datetime") as mock_dt:
            mock_dt.now.return_value = _make_dt(2026, 3, 18, 9, 29)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert is_market_hours(STALENESS_CONFIG) is False

    def test_weekday_at_market_open(self):
        # Wednesday 9:30 AM ET -- inclusive open
        with patch("scoring.common.datetime") as mock_dt:
            mock_dt.now.return_value = _make_dt(2026, 3, 18, 9, 30)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert is_market_hours(STALENESS_CONFIG) is True

    def test_weekday_at_market_close(self):
        # Wednesday 4:00 PM ET -- exclusive close
        with patch("scoring.common.datetime") as mock_dt:
            mock_dt.now.return_value = _make_dt(2026, 3, 18, 16, 0)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert is_market_hours(STALENESS_CONFIG) is False

    def test_weekday_after_market_close(self):
        # Wednesday 6:00 PM ET
        with patch("scoring.common.datetime") as mock_dt:
            mock_dt.now.return_value = _make_dt(2026, 3, 18, 18, 0)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert is_market_hours(STALENESS_CONFIG) is False

    def test_saturday(self):
        # Saturday 10:00 AM ET
        with patch("scoring.common.datetime") as mock_dt:
            mock_dt.now.return_value = _make_dt(2026, 3, 21, 10, 0)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert is_market_hours(STALENESS_CONFIG) is False

    def test_sunday(self):
        # Sunday 3:00 PM ET
        with patch("scoring.common.datetime") as mock_dt:
            mock_dt.now.return_value = _make_dt(2026, 3, 22, 15, 0)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert is_market_hours(STALENESS_CONFIG) is False

    def test_missing_staleness_config_returns_true(self):
        """Backward compat: no staleness block -> assume market hours."""
        with patch("scoring.common.datetime") as mock_dt:
            mock_dt.now.return_value = _make_dt(2026, 3, 22, 15, 0)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert is_market_hours({"scoring": {}}) is True


class TestGetStalenessHours:
    """Staleness hours vary by market schedule."""

    def test_market_hours_returns_tight_window(self):
        with patch("scoring.common.datetime") as mock_dt:
            mock_dt.now.return_value = _make_dt(2026, 3, 18, 10, 0)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert get_staleness_hours(STALENESS_CONFIG) == 2

    def test_off_hours_returns_relaxed_window(self):
        with patch("scoring.common.datetime") as mock_dt:
            mock_dt.now.return_value = _make_dt(2026, 3, 21, 10, 0)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert get_staleness_hours(STALENESS_CONFIG) == 48

    def test_missing_staleness_config_returns_default(self):
        """Backward compat: no staleness block -> 2.0."""
        assert get_staleness_hours({"scoring": {}}) == 2.0

    def test_partial_config_uses_defaults(self):
        """Missing sub-keys fall back to safe defaults."""
        config = {"staleness": {"off_hours_max_age": 72}}
        with patch("scoring.common.datetime") as mock_dt:
            # Saturday -- off-hours
            mock_dt.now.return_value = _make_dt(2026, 3, 21, 10, 0)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert get_staleness_hours(config) == 72

    def test_partial_config_market_hours_defaults_to_2(self):
        """Missing market_hours_max_age defaults to 2."""
        config = {"staleness": {"off_hours_max_age": 72}}
        with patch("scoring.common.datetime") as mock_dt:
            # Wednesday 10 AM -- market hours
            mock_dt.now.return_value = _make_dt(2026, 3, 18, 10, 0)
            mock_dt.side_effect = lambda *a, **kw: datetime(*a, **kw)
            assert get_staleness_hours(config) == 2
