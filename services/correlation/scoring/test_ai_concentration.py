"""Unit tests for AI Concentration scoring function.

Tests cover: SPY/RSP deviation scoring, SMH relative performance scoring,
top-10 weight placeholder scoring, composite scoring with renormalization,
clamping at 0 and 100, missing data handling.
"""

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
        # Remaining weights: 0.30 + 0.30 = 0.60
        # (50*0.30 + 50*0.30) / 0.60 = 30/0.60 = 50
        assert score == 50.0

    def test_missing_smh_renormalizes(self):
        config = AI_CONCENTRATION_CONFIG["scoring"]["ai_concentration"]
        sub_scores = {
            "spy_rsp_deviation": 100.0,
            "top10_weight": 0.0,
        }
        score = compute_composite_score(sub_scores, config)
        # Weights: 0.40 + 0.30 = 0.70
        # (100*0.40 + 0*0.30) / 0.70 = 40/0.70 = 57.14
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
        # 80*0.40 + 20*0.30 + 60*0.30 = 32 + 6 + 18 = 56
        assert score == 56.0


class TestScoreAiConcentrationFromValues:
    """Tests for the pure scoring logic without DB access."""

    def test_all_at_midpoint(self):
        from scoring.ai_concentration import score_ai_concentration_from_values

        result = score_ai_concentration_from_values(
            spy_rsp_ratio=1.075,  # deviation = 0.075 from 1.0 => 50% of 0.15
            smh_value=110.0,
            spy_value=100.0,  # relative = 0.10 => 50% of 0.20
            config=AI_CONCENTRATION_CONFIG,
        )
        # spy_rsp_deviation: linear_score(0.075, 0, 0.15) = 50
        # smh_relative: linear_score(0.10, 0, 0.20) = 50
        # top10_weight: linear_score(1.075, 1.5, 2.5) = 0 (below min)
        # Actually top10_weight uses the SPY_RSP_RATIO value directly
        # linear_score(1.075, 1.5, 2.5) = 0 (below min, clamped)
        # Composite: (50*0.40 + 50*0.30 + 0*0.30) / 1.0 = 35
        assert result == pytest.approx(35.0, abs=0.5)

    def test_all_none_returns_none(self):
        from scoring.ai_concentration import score_ai_concentration_from_values

        result = score_ai_concentration_from_values(
            spy_rsp_ratio=None,
            smh_value=None,
            spy_value=None,
            config=AI_CONCENTRATION_CONFIG,
        )
        assert result is None

    def test_spy_value_zero_excludes_smh_relative(self):
        """When spy_value is 0, smh_relative is excluded (division guard)."""
        from scoring.ai_concentration import score_ai_concentration_from_values

        result = score_ai_concentration_from_values(
            spy_rsp_ratio=1.075,
            smh_value=110.0,
            spy_value=0,
            config=AI_CONCENTRATION_CONFIG,
        )
        # spy_rsp_deviation: linear_score(0.075, 0, 0.15) = 50
        # smh_relative: excluded (spy_value == 0)
        # top10_weight: linear_score(1.075, 1.5, 2.5) = 0 (below min)
        # Weights: 0.40 + 0.30 = 0.70
        # Score: (50*0.40 + 0*0.30) / 0.70 = 20/0.70 = 28.57
        assert result == pytest.approx(28.57, abs=0.01)

    def test_missing_smh_renormalizes(self):
        from scoring.ai_concentration import score_ai_concentration_from_values

        result = score_ai_concentration_from_values(
            spy_rsp_ratio=1.075,
            smh_value=None,
            spy_value=100.0,
            config=AI_CONCENTRATION_CONFIG,
        )
        # spy_rsp_deviation: 50, top10_weight: 0 (1.075 < 1.5)
        # Weights: 0.40 + 0.30 = 0.70
        # Score: (50*0.40 + 0*0.30) / 0.70 = 20/0.70 = 28.57
        assert result == pytest.approx(28.57, abs=0.01)

    def test_high_concentration(self):
        from scoring.ai_concentration import score_ai_concentration_from_values

        result = score_ai_concentration_from_values(
            spy_rsp_ratio=2.5,  # deviation = 1.5 >> 0.15 => clamped 100
            smh_value=120.0,
            spy_value=100.0,  # relative = 0.20 => 100
            config=AI_CONCENTRATION_CONFIG,
        )
        # spy_rsp_deviation: 100, smh_relative: 100, top10_weight: linear_score(2.5, 1.5, 2.5) = 100
        assert result == pytest.approx(100.0)

    def test_low_concentration(self):
        from scoring.ai_concentration import score_ai_concentration_from_values

        result = score_ai_concentration_from_values(
            spy_rsp_ratio=1.0,  # deviation = 0 => 0
            smh_value=100.0,
            spy_value=100.0,  # relative = 0 => 0
            config=AI_CONCENTRATION_CONFIG,
        )
        # spy_rsp_deviation: 0, smh_relative: 0, top10_weight: linear_score(1.0, 1.5, 2.5) = 0
        assert result == pytest.approx(0.0)

    def test_missing_spy_value_excludes_smh_relative(self):
        from scoring.ai_concentration import score_ai_concentration_from_values

        result = score_ai_concentration_from_values(
            spy_rsp_ratio=1.15,  # deviation = 0.15 => 100
            smh_value=110.0,
            spy_value=None,  # can't compute relative
            config=AI_CONCENTRATION_CONFIG,
        )
        # spy_rsp_deviation: 100, top10_weight: linear_score(1.15, 1.5, 2.5) = 0
        # Weights: 0.40 + 0.30 = 0.70
        # Score: (100*0.40 + 0*0.30) / 0.70 = 40/0.70 = 57.14
        assert result == pytest.approx(57.14, abs=0.01)
