"""Unit tests for Private Credit Stress scoring function.

Tests cover: linear interpolation, inverted scale, missing data
renormalization, clamping at 0 and 100, config-driven thresholds.
"""

import pytest

from scoring.private_credit import linear_score, inverted_linear_score, score_private_credit


DEFAULT_CONFIG = {
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


class TestLinearScore:
    """Tests for the standard linear interpolation function."""

    def test_returns_zero_at_min(self):
        assert linear_score(300, 300, 600) == 0

    def test_returns_100_at_max(self):
        assert linear_score(600, 300, 600) == 100

    def test_returns_50_at_midpoint(self):
        assert linear_score(450, 300, 600) == 50

    def test_clamps_to_zero_below_min(self):
        assert linear_score(100, 300, 600) == 0

    def test_clamps_to_100_above_max(self):
        assert linear_score(900, 300, 600) == 100

    def test_fractional_interpolation(self):
        assert linear_score(375, 300, 600) == 25

    def test_returns_zero_when_min_equals_max(self):
        assert linear_score(300, 300, 300) == 0


class TestInvertedLinearScore:
    """Tests for the inverted scale (BDC discount: more negative = more stress)."""

    def test_returns_zero_at_nav_parity(self):
        assert inverted_linear_score(0, 0, -0.2) == 0

    def test_returns_100_at_max_discount(self):
        assert inverted_linear_score(-0.2, 0, -0.2) == 100

    def test_returns_50_at_midpoint(self):
        assert inverted_linear_score(-0.1, 0, -0.2) == 50

    def test_clamps_to_zero_for_premium(self):
        assert inverted_linear_score(0.05, 0, -0.2) == 0

    def test_clamps_to_100_for_deep_discount(self):
        assert inverted_linear_score(-0.3, 0, -0.2) == 100

    def test_returns_zero_when_min_equals_max(self):
        assert inverted_linear_score(0, 0, 0) == 0


class TestScorePrivateCredit:
    """Tests for the public scoring contract (unit-testable parts)."""

    def test_all_inputs_at_midpoint_scores_50(self):
        """All midpoint sub-scores produce composite score of 50."""
        from scoring.private_credit import _compute_composite_score

        config = DEFAULT_CONFIG["scoring"]["private_credit"]
        sub_scores = {
            "hy_spread": linear_score(450, 300, 600),
            "bdc_discount": inverted_linear_score(-0.10, 0, -0.20),
            "redemption_flow": 50.0,
            "spread_roc": linear_score(25, 0, 50),
        }
        assert _compute_composite_score(sub_scores, config) == 50.0

    def test_score_clamped_between_0_and_100(self):
        """Verify the linear_score clamps properly for extreme values."""
        assert linear_score(-1000, 300, 600) == 0
        assert linear_score(10000, 300, 600) == 100


class TestCompositeScoreMath:
    """Test the weighted-average math with known sub-scores.

    These use _compute_composite_score directly to test the renormalization
    and clamping logic without requiring a database connection.
    """

    def test_all_components_present(self):
        from scoring.private_credit import _compute_composite_score

        config = DEFAULT_CONFIG["scoring"]["private_credit"]
        # All midpoint sub-scores = 50
        sub_scores = {
            "hy_spread": 50.0,
            "bdc_discount": 50.0,
            "redemption_flow": 50.0,
            "spread_roc": 50.0,
        }
        score = _compute_composite_score(sub_scores, config)
        assert score == 50.0

    def test_missing_hy_spread_renormalizes(self):
        from scoring.private_credit import _compute_composite_score

        config = DEFAULT_CONFIG["scoring"]["private_credit"]
        # hy_spread missing, others at 50
        sub_scores = {
            "bdc_discount": 50.0,
            "redemption_flow": 50.0,
            "spread_roc": 50.0,
        }
        score = _compute_composite_score(sub_scores, config)
        # Remaining weights: 0.25+0.15+0.25=0.65, all at 50 => 50
        assert score == 50.0

    def test_missing_bdc_discount_renormalizes(self):
        from scoring.private_credit import _compute_composite_score

        config = DEFAULT_CONFIG["scoring"]["private_credit"]
        sub_scores = {
            "hy_spread": 100.0,
            "redemption_flow": 50.0,
            "spread_roc": 0.0,
        }
        score = _compute_composite_score(sub_scores, config)
        # Weights: hy 0.35, redemption 0.15, roc 0.25 = 0.75
        # Sum: 100*0.35 + 50*0.15 + 0*0.25 = 35 + 7.5 + 0 = 42.5
        # Renormalized: 42.5 / 0.75 = 56.666...
        assert score == pytest.approx(56.67, abs=0.01)

    def test_only_placeholder_remaining(self):
        from scoring.private_credit import _compute_composite_score

        config = DEFAULT_CONFIG["scoring"]["private_credit"]
        sub_scores = {
            "redemption_flow": 50.0,
        }
        score = _compute_composite_score(sub_scores, config)
        # Only redemption: 50*0.15/0.15 = 50
        assert score == 50.0

    def test_no_components_returns_zero(self):
        from scoring.private_credit import _compute_composite_score

        config = DEFAULT_CONFIG["scoring"]["private_credit"]
        sub_scores = {}
        score = _compute_composite_score(sub_scores, config)
        assert score == 0.0

    def test_extreme_high_scores(self):
        from scoring.private_credit import _compute_composite_score

        config = DEFAULT_CONFIG["scoring"]["private_credit"]
        sub_scores = {
            "hy_spread": 100.0,
            "bdc_discount": 100.0,
            "redemption_flow": 50.0,
            "spread_roc": 100.0,
        }
        score = _compute_composite_score(sub_scores, config)
        # 100*0.35 + 100*0.25 + 50*0.15 + 100*0.25 = 35+25+7.5+25 = 92.5
        assert score == 92.5

    def test_asymmetric_stress_levels(self):
        from scoring.private_credit import _compute_composite_score

        config = DEFAULT_CONFIG["scoring"]["private_credit"]
        sub_scores = {
            "hy_spread": 80.0,
            "bdc_discount": 20.0,
            "redemption_flow": 50.0,
            "spread_roc": 80.0,
        }
        score = _compute_composite_score(sub_scores, config)
        # 80*0.35 + 20*0.25 + 50*0.15 + 80*0.25 = 28+5+7.5+20 = 60.5
        assert score == 60.5
