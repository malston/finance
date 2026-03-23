"""Unit tests for AI Concentration scoring function.

Tests cover: SPY/RSP deviation scoring, SMH relative performance scoring,
top-10 weight placeholder scoring, composite scoring with renormalization,
clamping at 0 and 100, missing data handling, staleness_hours forwarding,
and data_time tracking.
"""

from datetime import datetime, timezone
from unittest.mock import patch, MagicMock

import pytest

from scoring.common import linear_score, compute_composite_score


AI_CONCENTRATION_CONFIG = {
    "scoring": {
        "ai_concentration": {
            "weight": 0.20,
            "components": {
                "spy_rsp_deviation": {
                    "sub_weight": 0.40,
                    "ticker": "SPY_RSP_RATIO",
                    "sma_days": 200,
                    "min_deviation": 0,
                    "max_deviation": 0.15,
                },
                "smh_relative": {
                    "sub_weight": 0.30,
                    "ticker_a": "SMH",
                    "ticker_b": "SPY",
                    "min_value": 0,
                    "max_value": 0.20,
                },
                "top10_weight": {
                    "sub_weight": 0.30,
                    "ticker": "SPY_RSP_RATIO",
                    "min_value": 1.5,
                    "max_value": 2.5,
                },
            },
        },
    },
}


class TestSpyRspDeviationScoring:
    """Tests for SPY/RSP ratio deviation sub-component."""

    def test_no_deviation_scores_zero(self):
        """Ratio at 1.0 (no deviation from equal weight) scores 0."""
        score = linear_score(0, 0, 0.15)
        assert score == 0.0

    def test_max_deviation_scores_100(self):
        """Deviation of 0.15 from 1.0 scores 100."""
        score = linear_score(0.15, 0, 0.15)
        assert score == 100.0

    def test_midpoint_deviation(self):
        """Deviation of 0.075 scores 50."""
        score = linear_score(0.075, 0, 0.15)
        assert score == pytest.approx(50.0)

    def test_clamped_above_max_deviation(self):
        """Deviation beyond 0.15 clamps at 100."""
        score = linear_score(0.30, 0, 0.15)
        assert score == 100.0

    def test_negative_deviation_clamps_to_zero(self):
        """Negative deviation (impossible in practice) clamps at 0."""
        score = linear_score(-0.05, 0, 0.15)
        assert score == 0.0


class TestSmhRelativeScoring:
    """Tests for SMH relative performance sub-component."""

    def test_no_outperformance_scores_zero(self):
        """SMH performing same as SPY (ratio 0) scores 0."""
        score = linear_score(0, 0, 0.20)
        assert score == 0.0

    def test_max_outperformance_scores_100(self):
        """SMH outperforming SPY by 20% scores 100."""
        score = linear_score(0.20, 0, 0.20)
        assert score == 100.0

    def test_midpoint_outperformance(self):
        """10% outperformance scores 50."""
        score = linear_score(0.10, 0, 0.20)
        assert score == pytest.approx(50.0)


class TestTop10WeightScoring:
    """Tests for top-10 weight sub-component (uses SPY_RSP_RATIO as proxy)."""

    def test_ratio_at_min_scores_zero(self):
        """SPY/RSP ratio of 1.5 scores 0."""
        score = linear_score(1.5, 1.5, 2.5)
        assert score == 0.0

    def test_ratio_at_max_scores_100(self):
        """SPY/RSP ratio of 2.5 scores 100."""
        score = linear_score(2.5, 1.5, 2.5)
        assert score == 100.0

    def test_ratio_at_midpoint(self):
        """SPY/RSP ratio of 2.0 scores 50."""
        score = linear_score(2.0, 1.5, 2.5)
        assert score == pytest.approx(50.0)

    def test_ratio_below_min_clamps(self):
        score = linear_score(1.0, 1.5, 2.5)
        assert score == 0.0


class TestAiConcentrationComposite:
    """Tests for the composite AI concentration score."""

    def test_all_at_midpoint_scores_50(self):
        config = AI_CONCENTRATION_CONFIG["scoring"]["ai_concentration"]
        sub_scores = {
            "spy_rsp_deviation": 50.0,
            "smh_relative": 50.0,
            "top10_weight": 50.0,
        }
        score = compute_composite_score(sub_scores, config)
        assert score == 50.0

    def test_all_at_zero_scores_zero(self):
        config = AI_CONCENTRATION_CONFIG["scoring"]["ai_concentration"]
        sub_scores = {
            "spy_rsp_deviation": 0.0,
            "smh_relative": 0.0,
            "top10_weight": 0.0,
        }
        score = compute_composite_score(sub_scores, config)
        assert score == 0.0

    def test_all_at_100_scores_100(self):
        config = AI_CONCENTRATION_CONFIG["scoring"]["ai_concentration"]
        sub_scores = {
            "spy_rsp_deviation": 100.0,
            "smh_relative": 100.0,
            "top10_weight": 100.0,
        }
        score = compute_composite_score(sub_scores, config)
        assert score == 100.0

    def test_missing_spy_rsp_renormalizes(self):
        config = AI_CONCENTRATION_CONFIG["scoring"]["ai_concentration"]
        sub_scores = {
            "smh_relative": 50.0,
            "top10_weight": 50.0,
        }
        score = compute_composite_score(sub_scores, config)
        assert score == 50.0

    def test_missing_smh_renormalizes(self):
        config = AI_CONCENTRATION_CONFIG["scoring"]["ai_concentration"]
        sub_scores = {
            "spy_rsp_deviation": 100.0,
            "top10_weight": 0.0,
        }
        score = compute_composite_score(sub_scores, config)
        assert score == pytest.approx(57.14, abs=0.01)

    def test_no_components_returns_none(self):
        config = AI_CONCENTRATION_CONFIG["scoring"]["ai_concentration"]
        sub_scores = {}
        score = compute_composite_score(sub_scores, config)
        assert score is None

    def test_asymmetric_stress(self):
        config = AI_CONCENTRATION_CONFIG["scoring"]["ai_concentration"]
        sub_scores = {
            "spy_rsp_deviation": 80.0,
            "smh_relative": 20.0,
            "top10_weight": 60.0,
        }
        score = compute_composite_score(sub_scores, config)
        assert score == 56.0


class TestScoreAiConcentrationFromValues:
    """Tests for the pure scoring logic without DB access."""

    def test_all_at_midpoint(self):
        from scoring.ai_concentration import score_ai_concentration_from_values
        result = score_ai_concentration_from_values(
            spy_rsp_ratio=1.075, smh_value=110.0, spy_value=100.0,
            config=AI_CONCENTRATION_CONFIG,
        )
        assert result == pytest.approx(35.0, abs=0.5)

    def test_all_none_returns_none(self):
        from scoring.ai_concentration import score_ai_concentration_from_values
        result = score_ai_concentration_from_values(
            spy_rsp_ratio=None, smh_value=None, spy_value=None,
            config=AI_CONCENTRATION_CONFIG,
        )
        assert result is None

    def test_spy_value_zero_excludes_smh_relative(self):
        """When spy_value is 0, smh_relative is excluded (division guard)."""
        from scoring.ai_concentration import score_ai_concentration_from_values
        result = score_ai_concentration_from_values(
            spy_rsp_ratio=1.075, smh_value=110.0, spy_value=0,
            config=AI_CONCENTRATION_CONFIG,
        )
        assert result == pytest.approx(28.57, abs=0.01)

    def test_missing_smh_renormalizes(self):
        from scoring.ai_concentration import score_ai_concentration_from_values
        result = score_ai_concentration_from_values(
            spy_rsp_ratio=1.075, smh_value=None, spy_value=100.0,
            config=AI_CONCENTRATION_CONFIG,
        )
        assert result == pytest.approx(28.57, abs=0.01)

    def test_high_concentration(self):
        from scoring.ai_concentration import score_ai_concentration_from_values
        result = score_ai_concentration_from_values(
            spy_rsp_ratio=2.5, smh_value=120.0, spy_value=100.0,
            config=AI_CONCENTRATION_CONFIG,
        )
        assert result == pytest.approx(100.0)

    def test_low_concentration(self):
        from scoring.ai_concentration import score_ai_concentration_from_values
        result = score_ai_concentration_from_values(
            spy_rsp_ratio=1.0, smh_value=100.0, spy_value=100.0,
            config=AI_CONCENTRATION_CONFIG,
        )
        assert result == pytest.approx(0.0)

    def test_missing_spy_value_excludes_smh_relative(self):
        from scoring.ai_concentration import score_ai_concentration_from_values
        result = score_ai_concentration_from_values(
            spy_rsp_ratio=1.15, smh_value=110.0, spy_value=None,
            config=AI_CONCENTRATION_CONFIG,
        )
        assert result == pytest.approx(57.14, abs=0.01)


class TestScoreAiConcentrationStaleness:
    """Tests for staleness_hours parameter and data_time tracking."""

    @patch("scoring.ai_concentration.psycopg2.connect")
    @patch("scoring.ai_concentration.write_score")
    @patch("scoring.ai_concentration.fetch_latest_with_time")
    def test_staleness_hours_defaults_to_2(
        self, mock_fetch_with_time, mock_write, mock_connect,
    ):
        """fetch_latest_with_time is called with max_age_hours=2 by default."""
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        t = datetime(2026, 3, 22, 12, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.return_value = (1.8, t)

        from scoring.ai_concentration import score_ai_concentration
        score_ai_concentration("fake_db_url", AI_CONCENTRATION_CONFIG)

        for c in mock_fetch_with_time.call_args_list:
            assert c.kwargs["max_age_hours"] == 2

    @patch("scoring.ai_concentration.psycopg2.connect")
    @patch("scoring.ai_concentration.write_score")
    @patch("scoring.ai_concentration.fetch_latest_with_time")
    def test_staleness_hours_48_forwarded(
        self, mock_fetch_with_time, mock_write, mock_connect,
    ):
        """fetch_latest_with_time is called with max_age_hours=48 when specified."""
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        t = datetime(2026, 3, 22, 12, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.return_value = (1.8, t)

        from scoring.ai_concentration import score_ai_concentration
        score_ai_concentration("fake_db_url", AI_CONCENTRATION_CONFIG, staleness_hours=48)

        for c in mock_fetch_with_time.call_args_list:
            assert c.kwargs["max_age_hours"] == 48

    @patch("scoring.ai_concentration.psycopg2.connect")
    @patch("scoring.ai_concentration.write_score")
    @patch("scoring.ai_concentration.fetch_latest_with_time")
    def test_data_time_is_min_of_source_timestamps(
        self, mock_fetch_with_time, mock_write, mock_connect,
    ):
        """data_time passed to write_score is the minimum of all source timestamps."""
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn

        t1 = datetime(2026, 3, 22, 10, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 3, 22, 11, 0, tzinfo=timezone.utc)
        t3 = datetime(2026, 3, 22, 9, 30, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [(1.8, t1), (250.0, t2), (500.0, t3)]

        from scoring.ai_concentration import score_ai_concentration
        score_ai_concentration("fake_db_url", AI_CONCENTRATION_CONFIG)

        mock_write.assert_called_once()
        assert mock_write.call_args.kwargs["data_time"] == t3

    @patch("scoring.ai_concentration.psycopg2.connect")
    @patch("scoring.ai_concentration.write_score")
    @patch("scoring.ai_concentration.fetch_latest_with_time")
    def test_data_time_when_only_some_fetches_succeed(
        self, mock_fetch_with_time, mock_write, mock_connect,
    ):
        """When only 1 of 3 fetches returns data, data_time is that single timestamp."""
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn

        t1 = datetime(2026, 3, 22, 14, 0, tzinfo=timezone.utc)
        mock_fetch_with_time.side_effect = [(1.8, t1), None, None]

        from scoring.ai_concentration import score_ai_concentration
        score_ai_concentration("fake_db_url", AI_CONCENTRATION_CONFIG)

        mock_write.assert_called_once()
        assert mock_write.call_args.kwargs["data_time"] == t1

    @patch("scoring.ai_concentration.psycopg2.connect")
    @patch("scoring.ai_concentration.write_score")
    @patch("scoring.ai_concentration.fetch_latest_with_time")
    def test_no_write_when_all_fetches_return_none(
        self, mock_fetch_with_time, mock_write, mock_connect,
    ):
        """When all fetches return None, score is None and write_score is not called."""
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        mock_fetch_with_time.return_value = None

        from scoring.ai_concentration import score_ai_concentration
        result = score_ai_concentration("fake_db_url", AI_CONCENTRATION_CONFIG)

        assert result is None
        mock_write.assert_not_called()
