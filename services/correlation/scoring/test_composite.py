"""Unit tests for composite threat score computation.

Tests cover: weighted average with all four domain scores, missing score
renormalization, threat level mapping, boundary conditions at level thresholds,
and edge cases (all missing, single score available).
"""

import pytest

from scoring.composite import (
    compute_composite_from_values,
    get_threat_level,
)


COMPOSITE_CONFIG = {
    "scoring": {
        "composite": {
            "domains": {
                "private_credit": {
                    "ticker": "SCORE_PRIVATE_CREDIT",
                    "weight": 0.30,
                },
                "ai_concentration": {
                    "ticker": "SCORE_AI_CONCENTRATION",
                    "weight": 0.20,
                },
                "energy_geo": {
                    "ticker": "SCORE_ENERGY_GEO",
                    "weight": 0.25,
                },
                "contagion": {
                    "ticker": "SCORE_CONTAGION",
                    "weight": 0.25,
                },
            },
            "threat_levels": [
                {"max_score": 25, "level": "LOW", "color": "#22c55e"},
                {"max_score": 50, "level": "ELEVATED", "color": "#eab308"},
                {"max_score": 75, "level": "HIGH", "color": "#f97316"},
                {"max_score": 100, "level": "CRITICAL", "color": "#ef4444"},
            ],
        },
    },
}


class TestComputeCompositeFromValues:
    """Test weighted average computation with renormalization."""

    def test_all_four_scores_present(self):
        """Weighted average: 68*0.30 + 52*0.20 + 74*0.25 + 61*0.25."""
        scores = {
            "private_credit": 68.0,
            "ai_concentration": 52.0,
            "energy_geo": 74.0,
            "contagion": 61.0,
        }
        # 20.4 + 10.4 + 18.5 + 15.25 = 64.55
        result = compute_composite_from_values(scores, COMPOSITE_CONFIG)
        assert result == pytest.approx(64.55, abs=0.01)

    def test_all_scores_at_zero(self):
        scores = {
            "private_credit": 0.0,
            "ai_concentration": 0.0,
            "energy_geo": 0.0,
            "contagion": 0.0,
        }
        result = compute_composite_from_values(scores, COMPOSITE_CONFIG)
        assert result == pytest.approx(0.0)

    def test_all_scores_at_100(self):
        scores = {
            "private_credit": 100.0,
            "ai_concentration": 100.0,
            "energy_geo": 100.0,
            "contagion": 100.0,
        }
        result = compute_composite_from_values(scores, COMPOSITE_CONFIG)
        assert result == pytest.approx(100.0)

    def test_uniform_50_scores(self):
        scores = {
            "private_credit": 50.0,
            "ai_concentration": 50.0,
            "energy_geo": 50.0,
            "contagion": 50.0,
        }
        result = compute_composite_from_values(scores, COMPOSITE_CONFIG)
        assert result == pytest.approx(50.0)

    def test_missing_one_score_renormalizes(self):
        """When private_credit is missing, remaining weights (0.70) are renormalized."""
        scores = {
            "ai_concentration": 50.0,
            "energy_geo": 50.0,
            "contagion": 50.0,
        }
        # All present scores are 50. With renormalization: 50
        result = compute_composite_from_values(scores, COMPOSITE_CONFIG)
        assert result == pytest.approx(50.0, abs=0.01)

    def test_missing_two_scores_renormalizes(self):
        """When private_credit and ai_concentration are missing."""
        scores = {
            "energy_geo": 80.0,
            "contagion": 40.0,
        }
        # Weights: 0.25 + 0.25 = 0.50
        # Weighted: 80*0.25 + 40*0.25 = 20 + 10 = 30
        # Renormalized: 30 / 0.50 = 60
        result = compute_composite_from_values(scores, COMPOSITE_CONFIG)
        assert result == pytest.approx(60.0, abs=0.01)

    def test_single_score_available(self):
        """Only contagion available, weight renormalized to 1.0."""
        scores = {"contagion": 75.0}
        result = compute_composite_from_values(scores, COMPOSITE_CONFIG)
        assert result == pytest.approx(75.0, abs=0.01)

    def test_no_scores_returns_zero(self):
        scores = {}
        result = compute_composite_from_values(scores, COMPOSITE_CONFIG)
        assert result == pytest.approx(0.0)

    def test_result_clamped_to_100(self):
        """Even if individual scores exceed 100, composite is clamped."""
        scores = {
            "private_credit": 100.0,
            "ai_concentration": 100.0,
            "energy_geo": 100.0,
            "contagion": 100.0,
        }
        result = compute_composite_from_values(scores, COMPOSITE_CONFIG)
        assert result <= 100.0

    def test_result_rounded_to_two_decimals(self):
        scores = {
            "private_credit": 33.33,
            "ai_concentration": 66.67,
            "energy_geo": 11.11,
            "contagion": 88.89,
        }
        result = compute_composite_from_values(scores, COMPOSITE_CONFIG)
        # Verify result has at most 2 decimal places
        assert result == round(result, 2)


class TestGetThreatLevel:
    """Test threat level mapping from score to level/color."""

    def test_low_at_zero(self):
        level, color = get_threat_level(0, COMPOSITE_CONFIG)
        assert level == "LOW"
        assert color == "#22c55e"

    def test_low_at_25(self):
        level, color = get_threat_level(25, COMPOSITE_CONFIG)
        assert level == "LOW"
        assert color == "#22c55e"

    def test_elevated_at_26(self):
        level, color = get_threat_level(26, COMPOSITE_CONFIG)
        assert level == "ELEVATED"
        assert color == "#eab308"

    def test_elevated_at_50(self):
        level, color = get_threat_level(50, COMPOSITE_CONFIG)
        assert level == "ELEVATED"
        assert color == "#eab308"

    def test_high_at_51(self):
        level, color = get_threat_level(51, COMPOSITE_CONFIG)
        assert level == "HIGH"
        assert color == "#f97316"

    def test_high_at_75(self):
        level, color = get_threat_level(75, COMPOSITE_CONFIG)
        assert level == "HIGH"
        assert color == "#f97316"

    def test_critical_at_76(self):
        level, color = get_threat_level(76, COMPOSITE_CONFIG)
        assert level == "CRITICAL"
        assert color == "#ef4444"

    def test_critical_at_100(self):
        level, color = get_threat_level(100, COMPOSITE_CONFIG)
        assert level == "CRITICAL"
        assert color == "#ef4444"

    def test_fractional_boundary_25_point_5(self):
        """25.5 is above 25, should be ELEVATED."""
        level, color = get_threat_level(25.5, COMPOSITE_CONFIG)
        assert level == "ELEVATED"

    def test_fractional_boundary_50_point_5(self):
        """50.5 is above 50, should be HIGH."""
        level, color = get_threat_level(50.5, COMPOSITE_CONFIG)
        assert level == "HIGH"

    def test_fractional_boundary_75_point_5(self):
        """75.5 is above 75, should be CRITICAL."""
        level, color = get_threat_level(75.5, COMPOSITE_CONFIG)
        assert level == "CRITICAL"

    def test_story_acceptance_value_64(self):
        """AC example: score 64 -> HIGH."""
        level, color = get_threat_level(64, COMPOSITE_CONFIG)
        assert level == "HIGH"
        assert color == "#f97316"
