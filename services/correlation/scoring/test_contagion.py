"""Unit tests for Cross-Domain Contagion scoring function.

Tests cover: max pairwise correlation selection, VIX scoring,
composite scoring, linear interpolation edge cases,
clamping at 0 and 100, missing data renormalization,
staleness_hours forwarding, and data_time tracking.
"""

from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

import pytest

from scoring.contagion import (
    linear_score,
    select_max_pairwise_correlation,
    score_contagion_from_values,
)


# ---- linear_score (imported, but verify contagion-specific usage) ----


class TestLinearScore:
    """linear_score is reused from private_credit pattern; verify behavior."""

    def test_returns_zero_at_min(self):
        assert linear_score(0.1, 0.1, 0.7) == 0.0

    def test_returns_100_at_max(self):
        assert linear_score(0.7, 0.1, 0.7) == 100.0

    def test_midpoint(self):
        assert linear_score(0.4, 0.1, 0.7) == pytest.approx(50.0)

    def test_clamps_below_min(self):
        assert linear_score(0.0, 0.1, 0.7) == 0.0

    def test_clamps_above_max(self):
        assert linear_score(1.0, 0.1, 0.7) == 100.0

    def test_returns_zero_when_min_equals_max(self):
        assert linear_score(5.0, 5.0, 5.0) == 0.0


# ---- Max pairwise correlation selection ----


class TestSelectMaxPairwiseCorrelation:
    """Test that max abs correlation is selected from the three pairs."""

    def test_selects_highest_positive(self):
        values = {"CORR_CREDIT_TECH": 0.5, "CORR_CREDIT_ENERGY": 0.3, "CORR_TECH_ENERGY": 0.7}
        assert select_max_pairwise_correlation(values) == 0.7

    def test_uses_absolute_value_for_negative(self):
        values = {"CORR_CREDIT_TECH": -0.8, "CORR_CREDIT_ENERGY": 0.3, "CORR_TECH_ENERGY": 0.1}
        assert select_max_pairwise_correlation(values) == 0.8

    def test_all_negative(self):
        values = {"CORR_CREDIT_TECH": -0.2, "CORR_CREDIT_ENERGY": -0.5, "CORR_TECH_ENERGY": -0.1}
        assert select_max_pairwise_correlation(values) == 0.5

    def test_returns_none_when_empty(self):
        assert select_max_pairwise_correlation({}) is None

    def test_returns_none_when_all_missing(self):
        values = {"CORR_CREDIT_TECH": None, "CORR_CREDIT_ENERGY": None, "CORR_TECH_ENERGY": None}
        assert select_max_pairwise_correlation(values) is None

    def test_ignores_none_values(self):
        values = {"CORR_CREDIT_TECH": None, "CORR_CREDIT_ENERGY": 0.4, "CORR_TECH_ENERGY": None}
        assert select_max_pairwise_correlation(values) == 0.4

    def test_single_available_pair(self):
        values = {"CORR_CREDIT_TECH": 0.6}
        assert select_max_pairwise_correlation(values) == 0.6


# ---- Composite score from raw values ----


CONTAGION_CONFIG = {
    "scoring": {
        "contagion": {
            "weight": 0.25,
            "components": {
                "max_correlation": {
                    "sub_weight": 0.60,
                    "min_value": 0.1,
                    "max_value": 0.7,
                },
                "vix_level": {
                    "sub_weight": 0.40,
                    "ticker": "VIXY",
                    "min_value": 15,
                    "max_value": 40,
                },
            },
        },
    },
}


class TestScoreContagionFromValues:
    """Test the pure scoring logic without DB access."""

    def test_all_at_midpoint(self):
        result = score_contagion_from_values(max_corr=0.4, vix_value=27.5, config=CONTAGION_CONFIG)
        assert result == pytest.approx(50.0, abs=0.5)

    def test_all_at_minimum(self):
        result = score_contagion_from_values(max_corr=0.1, vix_value=15.0, config=CONTAGION_CONFIG)
        assert result == pytest.approx(0.0)

    def test_all_at_maximum(self):
        result = score_contagion_from_values(max_corr=0.7, vix_value=40.0, config=CONTAGION_CONFIG)
        assert result == pytest.approx(100.0)

    def test_high_correlation_dominates(self):
        result = score_contagion_from_values(max_corr=0.7, vix_value=15.0, config=CONTAGION_CONFIG)
        assert result == pytest.approx(60.0, abs=0.1)

    def test_missing_correlation_renormalizes(self):
        result = score_contagion_from_values(max_corr=None, vix_value=27.5, config=CONTAGION_CONFIG)
        assert result == pytest.approx(50.0, abs=0.5)

    def test_missing_vix_renormalizes(self):
        result = score_contagion_from_values(max_corr=0.4, vix_value=None, config=CONTAGION_CONFIG)
        assert result == pytest.approx(50.0, abs=0.5)

    def test_all_missing_returns_none(self):
        result = score_contagion_from_values(max_corr=None, vix_value=None, config=CONTAGION_CONFIG)
        assert result is None

    def test_clamped_below_zero(self):
        result = score_contagion_from_values(max_corr=0.0, vix_value=10.0, config=CONTAGION_CONFIG)
        assert result == pytest.approx(0.0)

    def test_clamped_above_100(self):
        result = score_contagion_from_values(max_corr=0.95, vix_value=60.0, config=CONTAGION_CONFIG)
        assert result == pytest.approx(100.0)

    def test_story_acceptance_values(self):
        """Verify with the AC seed values: corr=0.5, VIX=28."""
        result = score_contagion_from_values(max_corr=0.5, vix_value=28.0, config=CONTAGION_CONFIG)
        assert result == pytest.approx(60.8, abs=0.1)


# ---- Staleness-aware fetching and data_time tracking ----


class TestStalenessHoursForwarding:
    """Verify staleness_hours parameter is forwarded to all fetch_latest_with_time calls."""

    @patch("scoring.contagion.psycopg2.connect")
    @patch("scoring.contagion.write_score")
    @patch("scoring.contagion.fetch_latest_with_time")
    def test_staleness_hours_defaults_to_2(
        self, mock_fetch_with_time, mock_write, mock_connect,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        t = datetime(2026, 3, 20, 16, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [(0.5, t), (0.3, t), (0.2, t), (28.0, t)]
        from scoring.contagion import score_contagion
        score_contagion("fake_db_url", CONTAGION_CONFIG)
        assert mock_fetch_with_time.call_count == 4
        for c in mock_fetch_with_time.call_args_list:
            assert c.kwargs.get("max_age_hours") == 2

    @patch("scoring.contagion.psycopg2.connect")
    @patch("scoring.contagion.write_score")
    @patch("scoring.contagion.fetch_latest_with_time")
    def test_staleness_hours_48_forwarded(
        self, mock_fetch_with_time, mock_write, mock_connect,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        t = datetime(2026, 3, 20, 16, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [(0.5, t), (0.3, t), (0.2, t), (28.0, t)]
        from scoring.contagion import score_contagion
        score_contagion("fake_db_url", CONTAGION_CONFIG, staleness_hours=48)
        assert mock_fetch_with_time.call_count == 4
        for c in mock_fetch_with_time.call_args_list:
            assert c.kwargs.get("max_age_hours") == 48


class TestDataTimeTracking:
    """Verify data_time passed to write_score is the min of all source timestamps."""

    @patch("scoring.contagion.psycopg2.connect")
    @patch("scoring.contagion.write_score")
    @patch("scoring.contagion.fetch_latest_with_time")
    def test_data_time_is_min_of_all_source_timestamps(
        self, mock_fetch_with_time, mock_write, mock_connect,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        t1 = datetime(2026, 3, 20, 14, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 3, 20, 15, 0, tzinfo=timezone.utc)
        t3 = datetime(2026, 3, 20, 16, 0, tzinfo=timezone.utc)
        t4 = datetime(2026, 3, 20, 13, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [(0.5, t1), (0.3, t2), (0.2, t3), (28.0, t4)]
        from scoring.contagion import score_contagion
        score_contagion("fake_db_url", CONTAGION_CONFIG)
        mock_write.assert_called_once()
        _, kwargs = mock_write.call_args
        assert kwargs.get("data_time") == t4

    @patch("scoring.contagion.psycopg2.connect")
    @patch("scoring.contagion.write_score")
    @patch("scoring.contagion.fetch_latest_with_time")
    def test_data_time_when_some_fetches_return_none(
        self, mock_fetch_with_time, mock_write, mock_connect,
    ):
        """When 2 of 4 fetches return None, data_time is min of remaining 2."""
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        t1 = datetime(2026, 3, 20, 15, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 3, 20, 12, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [None, (0.3, t1), None, (28.0, t2)]
        from scoring.contagion import score_contagion
        score_contagion("fake_db_url", CONTAGION_CONFIG)
        mock_write.assert_called_once()
        _, kwargs = mock_write.call_args
        assert kwargs.get("data_time") == t2

    @patch("scoring.contagion.psycopg2.connect")
    @patch("scoring.contagion.write_score")
    @patch("scoring.contagion.fetch_latest_with_time")
    def test_no_write_when_all_fetches_return_none(
        self, mock_fetch_with_time, mock_write, mock_connect,
    ):
        """When all fetches return None, score is None and write_score is not called."""
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        mock_fetch_with_time.return_value = None
        from scoring.contagion import score_contagion
        result = score_contagion("fake_db_url", CONTAGION_CONFIG)
        assert result is None
        mock_write.assert_not_called()
