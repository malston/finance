"""Unit tests for Cross-Domain Contagion scoring function.

Tests cover: max pairwise correlation selection, VIX scoring, MOVE scoring,
VIX-MOVE co-movement, composite scoring, linear interpolation edge cases,
clamping at 0 and 100, missing data renormalization.
"""

import pytest

from scoring.contagion import (
    linear_score,
    select_max_pairwise_correlation,
    compute_vix_move_comovement,
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


# ---- VIX-MOVE co-movement ----


class TestComputeVixMoveComovement:
    """VIX-MOVE co-movement is average of VIX and MOVE sub-scores."""

    def test_both_at_midpoint(self):
        # VIX score 50, MOVE score 50 -> co-movement = 50
        result = compute_vix_move_comovement(vix_score=50.0, move_score=50.0)
        assert result == pytest.approx(50.0)

    def test_both_at_zero(self):
        result = compute_vix_move_comovement(vix_score=0.0, move_score=0.0)
        assert result == pytest.approx(0.0)

    def test_both_at_100(self):
        result = compute_vix_move_comovement(vix_score=100.0, move_score=100.0)
        assert result == pytest.approx(100.0)

    def test_vix_high_move_low(self):
        # Only VIX stressed -> moderate co-movement
        result = compute_vix_move_comovement(vix_score=100.0, move_score=0.0)
        assert result == pytest.approx(50.0)

    def test_asymmetric(self):
        result = compute_vix_move_comovement(vix_score=80.0, move_score=40.0)
        assert result == pytest.approx(60.0)


# ---- Composite score from raw values ----


CONTAGION_CONFIG = {
    "scoring": {
        "contagion": {
            "weight": 0.25,
            "components": {
                "max_correlation": {
                    "sub_weight": 0.40,
                    "min_value": 0.1,
                    "max_value": 0.7,
                },
                "vix_level": {
                    "sub_weight": 0.25,
                    "ticker": "VIX",
                    "min_value": 15,
                    "max_value": 40,
                },
                "move_level": {
                    "sub_weight": 0.20,
                    "ticker": "MOVE",
                    "min_value": 80,
                    "max_value": 160,
                },
                "vix_move_comovement": {
                    "sub_weight": 0.15,
                },
            },
        },
    },
}


class TestScoreContagionFromValues:
    """Test the pure scoring logic without DB access."""

    def test_all_at_midpoint(self):
        # correlation=0.4 (mid of 0.1-0.7), VIX=27.5 (mid of 15-40), MOVE=120 (mid of 80-160)
        result = score_contagion_from_values(
            max_corr=0.4,
            vix_value=27.5,
            move_value=120.0,
            config=CONTAGION_CONFIG,
        )
        assert result == pytest.approx(50.0, abs=0.5)

    def test_all_at_minimum(self):
        result = score_contagion_from_values(
            max_corr=0.1,
            vix_value=15.0,
            move_value=80.0,
            config=CONTAGION_CONFIG,
        )
        assert result == pytest.approx(0.0)

    def test_all_at_maximum(self):
        result = score_contagion_from_values(
            max_corr=0.7,
            vix_value=40.0,
            move_value=160.0,
            config=CONTAGION_CONFIG,
        )
        assert result == pytest.approx(100.0)

    def test_high_correlation_dominates(self):
        # High correlation (0.7=100), low VIX and MOVE (0)
        result = score_contagion_from_values(
            max_corr=0.7,
            vix_value=15.0,
            move_value=80.0,
            config=CONTAGION_CONFIG,
        )
        # max_corr=100 * 0.40, vix=0 * 0.25, move=0 * 0.20, comovement=0 * 0.15
        # = 40 / 1.0 = 40
        assert result == pytest.approx(40.0, abs=0.1)

    def test_missing_correlation_renormalizes(self):
        # When max_corr is None, only VIX/MOVE/comovement contribute
        result = score_contagion_from_values(
            max_corr=None,
            vix_value=27.5,
            move_value=120.0,
            config=CONTAGION_CONFIG,
        )
        # VIX=50, MOVE=50, comovement=50
        # Weights: 0.25 + 0.20 + 0.15 = 0.60
        # Weighted: 50*0.25 + 50*0.20 + 50*0.15 = 12.5+10+7.5 = 30
        # Renormalized: 30 / 0.60 = 50
        assert result == pytest.approx(50.0, abs=0.5)

    def test_missing_vix_renormalizes(self):
        result = score_contagion_from_values(
            max_corr=0.4,
            vix_value=None,
            move_value=120.0,
            config=CONTAGION_CONFIG,
        )
        # max_corr=50, move=50, comovement uses move_score only? No -- if VIX missing,
        # vix_score is None, so comovement can't be computed either
        # Remaining: max_corr (0.40) + move (0.20) = 0.60
        # Score: (50*0.40 + 50*0.20) / 0.60 = 30/0.60 = 50
        assert result == pytest.approx(50.0, abs=0.5)

    def test_missing_move_renormalizes(self):
        result = score_contagion_from_values(
            max_corr=0.4,
            vix_value=27.5,
            move_value=None,
            config=CONTAGION_CONFIG,
        )
        # Remaining: max_corr (0.40) + vix (0.25) = 0.65
        # Score: (50*0.40 + 50*0.25) / 0.65 = 32.5/0.65 = 50
        assert result == pytest.approx(50.0, abs=0.5)

    def test_all_missing_returns_zero(self):
        result = score_contagion_from_values(
            max_corr=None,
            vix_value=None,
            move_value=None,
            config=CONTAGION_CONFIG,
        )
        assert result == pytest.approx(0.0)

    def test_clamped_below_zero(self):
        # All inputs well below thresholds
        result = score_contagion_from_values(
            max_corr=0.0,
            vix_value=10.0,
            move_value=50.0,
            config=CONTAGION_CONFIG,
        )
        assert result == pytest.approx(0.0)

    def test_clamped_above_100(self):
        # All inputs well above thresholds
        result = score_contagion_from_values(
            max_corr=0.95,
            vix_value=60.0,
            move_value=200.0,
            config=CONTAGION_CONFIG,
        )
        assert result == pytest.approx(100.0)

    def test_story_acceptance_values(self):
        """Verify with the AC seed values: corr=0.5, VIX=28, MOVE=120."""
        result = score_contagion_from_values(
            max_corr=0.5,
            vix_value=28.0,
            move_value=120.0,
            config=CONTAGION_CONFIG,
        )
        # max_corr: (0.5-0.1)/(0.7-0.1)*100 = 66.67
        # vix: (28-15)/(40-15)*100 = 52.0
        # move: (120-80)/(160-80)*100 = 50.0
        # comovement: (52.0 + 50.0) / 2 = 51.0
        # composite: 66.67*0.40 + 52.0*0.25 + 50.0*0.20 + 51.0*0.15
        #          = 26.668 + 13.0 + 10.0 + 7.65 = 57.318
        assert result == pytest.approx(57.32, abs=0.1)
