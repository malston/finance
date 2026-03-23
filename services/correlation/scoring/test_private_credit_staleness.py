"""Unit tests for Private Credit staleness-aware fetching and timestamp tracking.

Tests cover:
- staleness_hours parameter defaults to 2
- staleness_hours is forwarded to fetch_latest_with_time
- data_time is min of source timestamps when both present
- data_time uses single timestamp when only one fetch returns data
- data_time is None when no source data (both fetches return None; write_score called with data_time=None)
- Existing callers without staleness_hours still work
"""

from datetime import datetime, timezone
from unittest.mock import patch, MagicMock, call

import pytest

from scoring.private_credit import score_private_credit


STALENESS_CONFIG = {
    "scoring": {
        "private_credit": {
            "weight": 0.30,
            "components": {
                "hy_spread": {
                    "sub_weight": 0.35,
                    "ticker": "BAMLH0A0HYM2",
                    "min_value": 300,
                    "max_value": 600,
                },
                "bdc_discount": {
                    "sub_weight": 0.25,
                    "ticker": "BDC_AVG_NAV_DISCOUNT",
                    "min_value": 0,
                    "max_value": -0.20,
                },
                "redemption_flow": {
                    "sub_weight": 0.15,
                    "placeholder": 50,
                },
                "spread_roc": {
                    "sub_weight": 0.25,
                    "ticker": "BAMLH0A0HYM2",
                    "min_value": 0,
                    "max_value": 50,
                    "lookback_days": 5,
                },
            },
        },
    },
}


class TestStalenessHoursDefault:
    """staleness_hours defaults to 2 when not provided."""

    @patch("scoring.private_credit._fetch_value_days_ago")
    @patch("scoring.private_credit.psycopg2.connect")
    @patch("scoring.private_credit.write_score")
    @patch("scoring.private_credit.fetch_latest_with_time")
    def test_staleness_hours_defaults_to_2(
        self, mock_fetch_with_time, mock_write, mock_connect, mock_fetch_days,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        hy_time = datetime(2026, 3, 21, 20, 0, tzinfo=timezone.utc)
        bdc_time = datetime(2026, 3, 21, 19, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [
            (450.0, hy_time),
            (-0.10, bdc_time),
        ]
        mock_fetch_days.return_value = 400.0

        score_private_credit("fake_db_url", STALENESS_CONFIG)

        for c in mock_fetch_with_time.call_args_list:
            assert c[1].get("max_age_hours", c[0][2] if len(c[0]) > 2 else None) == 2


class TestStalenessHoursForwarding:
    """staleness_hours is forwarded to fetch_latest_with_time."""

    @patch("scoring.private_credit._fetch_value_days_ago")
    @patch("scoring.private_credit.psycopg2.connect")
    @patch("scoring.private_credit.write_score")
    @patch("scoring.private_credit.fetch_latest_with_time")
    def test_staleness_hours_48_forwarded(
        self, mock_fetch_with_time, mock_write, mock_connect, mock_fetch_days,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        hy_time = datetime(2026, 3, 20, 16, 0, tzinfo=timezone.utc)
        bdc_time = datetime(2026, 3, 20, 15, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [
            (450.0, hy_time),
            (-0.10, bdc_time),
        ]
        mock_fetch_days.return_value = 400.0

        score_private_credit("fake_db_url", STALENESS_CONFIG, staleness_hours=48)

        for c in mock_fetch_with_time.call_args_list:
            assert c[1].get("max_age_hours", c[0][2] if len(c[0]) > 2 else None) == 48


class TestDataTimeTracking:
    """data_time tracks the min timestamp across fetched values."""

    @patch("scoring.private_credit._fetch_value_days_ago")
    @patch("scoring.private_credit.psycopg2.connect")
    @patch("scoring.private_credit.write_score")
    @patch("scoring.private_credit.fetch_latest_with_time")
    def test_data_time_is_min_of_source_timestamps(
        self, mock_fetch_with_time, mock_write, mock_connect, mock_fetch_days,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        hy_time = datetime(2026, 3, 21, 20, 0, tzinfo=timezone.utc)
        bdc_time = datetime(2026, 3, 21, 19, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [
            (450.0, hy_time),
            (-0.10, bdc_time),
        ]
        mock_fetch_days.return_value = 400.0

        score_private_credit("fake_db_url", STALENESS_CONFIG)

        mock_write.assert_called_once()
        _, kwargs = mock_write.call_args
        assert kwargs["data_time"] == bdc_time

    @patch("scoring.private_credit._fetch_value_days_ago")
    @patch("scoring.private_credit.psycopg2.connect")
    @patch("scoring.private_credit.write_score")
    @patch("scoring.private_credit.fetch_latest_with_time")
    def test_data_time_single_timestamp_when_only_hy_returns(
        self, mock_fetch_with_time, mock_write, mock_connect, mock_fetch_days,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        hy_time = datetime(2026, 3, 21, 20, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [
            (450.0, hy_time),
            None,
        ]
        mock_fetch_days.return_value = 400.0

        score_private_credit("fake_db_url", STALENESS_CONFIG)

        mock_write.assert_called_once()
        _, kwargs = mock_write.call_args
        assert kwargs["data_time"] == hy_time

    @patch("scoring.private_credit._fetch_value_days_ago")
    @patch("scoring.private_credit.psycopg2.connect")
    @patch("scoring.private_credit.write_score")
    @patch("scoring.private_credit.fetch_latest_with_time")
    def test_data_time_single_timestamp_when_only_bdc_returns(
        self, mock_fetch_with_time, mock_write, mock_connect, mock_fetch_days,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        bdc_time = datetime(2026, 3, 21, 19, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [
            None,
            (-0.10, bdc_time),
        ]
        mock_fetch_days.return_value = None

        score_private_credit("fake_db_url", STALENESS_CONFIG)

        mock_write.assert_called_once()
        _, kwargs = mock_write.call_args
        assert kwargs["data_time"] == bdc_time

    @patch("scoring.private_credit._fetch_value_days_ago")
    @patch("scoring.private_credit.psycopg2.connect")
    @patch("scoring.private_credit.write_score")
    @patch("scoring.private_credit.fetch_latest_with_time")
    def test_data_time_none_when_no_source_data(
        self, mock_fetch_with_time, mock_write, mock_connect, mock_fetch_days,
    ):
        """When both fetches return None, score is computed from placeholder only.
        write_score is called but data_time should be None."""
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        mock_fetch_with_time.return_value = None
        mock_fetch_days.return_value = None

        result = score_private_credit("fake_db_url", STALENESS_CONFIG)

        mock_write.assert_called_once()
        _, kwargs = mock_write.call_args
        assert kwargs["data_time"] is None


class TestExistingCallersCompatibility:
    """Existing callers without staleness_hours still work."""

    @patch("scoring.private_credit._fetch_value_days_ago")
    @patch("scoring.private_credit.psycopg2.connect")
    @patch("scoring.private_credit.write_score")
    @patch("scoring.private_credit.fetch_latest_with_time")
    def test_call_without_staleness_hours(
        self, mock_fetch_with_time, mock_write, mock_connect, mock_fetch_days,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        hy_time = datetime(2026, 3, 21, 20, 0, tzinfo=timezone.utc)
        bdc_time = datetime(2026, 3, 21, 19, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [
            (450.0, hy_time),
            (-0.10, bdc_time),
        ]
        mock_fetch_days.return_value = 400.0

        result = score_private_credit("fake_db_url", STALENESS_CONFIG)

        assert result is not None
        assert 0 <= result <= 100
