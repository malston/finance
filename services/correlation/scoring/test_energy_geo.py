"""Unit tests for Energy/Geopolitical scoring function.

Tests cover: crude oil level scoring, crude volatility scoring, EWT drawdown
scoring (inverted scale), rolling volatility computation, drawdown computation,
composite scoring with renormalization, clamping at 0 and 100, missing data
handling.
"""

import math

import pytest

from scoring.common import linear_score, inverted_linear_score, compute_composite_score
from scoring.energy_geo import compute_rolling_volatility, compute_drawdown


ENERGY_GEO_CONFIG = {
    "scoring": {
        "energy_geo": {
            "weight": 0.25,
            "components": {
                "crude_level": {
                    "sub_weight": 0.30,
                    "ticker": "CL=F",
                    "min_value": 50,
                    "max_value": 120,
                },
                "crude_volatility": {
                    "sub_weight": 0.35,
                    "ticker": "CL=F",
                    "lookback_days": 30,
                    "min_value": 0.15,
                    "max_value": 0.50,
                },
                "ewt_drawdown": {
                    "sub_weight": 0.35,
                    "ticker": "EWT",
                    "lookback_days": 252,
                    "min_value": 0,
                    "max_value": -0.25,
                },
            },
        },
    },
}


class TestCrudeLevelScoring:
    """Tests for crude oil price level sub-component."""

    def test_at_min_scores_zero(self):
        assert linear_score(50, 50, 120) == 0.0

    def test_at_max_scores_100(self):
        assert linear_score(120, 50, 120) == 100.0

    def test_midpoint(self):
        assert linear_score(85, 50, 120) == pytest.approx(50.0)

    def test_below_min_clamps(self):
        assert linear_score(30, 50, 120) == 0.0

    def test_above_max_clamps(self):
        assert linear_score(150, 50, 120) == 100.0


class TestCrudeVolatilityScoring:
    """Tests for crude oil volatility sub-component."""

    def test_at_min_vol_scores_zero(self):
        assert linear_score(0.15, 0.15, 0.50) == 0.0

    def test_at_max_vol_scores_100(self):
        assert linear_score(0.50, 0.15, 0.50) == 100.0

    def test_midpoint_vol(self):
        assert linear_score(0.325, 0.15, 0.50) == pytest.approx(50.0)

    def test_below_min_vol_clamps(self):
        assert linear_score(0.05, 0.15, 0.50) == 0.0

    def test_above_max_vol_clamps(self):
        assert linear_score(0.80, 0.15, 0.50) == 100.0


class TestEwtDrawdownScoring:
    """Tests for EWT drawdown sub-component (inverted scale: 0 to -0.25)."""

    def test_no_drawdown_scores_zero(self):
        assert inverted_linear_score(0, 0, -0.25) == 0.0

    def test_max_drawdown_scores_100(self):
        assert inverted_linear_score(-0.25, 0, -0.25) == 100.0

    def test_midpoint_drawdown(self):
        assert inverted_linear_score(-0.125, 0, -0.25) == pytest.approx(50.0)

    def test_positive_value_clamps_to_zero(self):
        """EWT above recent high (positive 'drawdown') clamps at 0."""
        assert inverted_linear_score(0.05, 0, -0.25) == 0.0

    def test_deep_drawdown_clamps_to_100(self):
        assert inverted_linear_score(-0.40, 0, -0.25) == 100.0


class TestComputeRollingVolatility:
    """Tests for the rolling volatility helper."""

    def test_returns_none_for_empty_list(self):
        assert compute_rolling_volatility([]) is None

    def test_returns_none_for_single_value(self):
        assert compute_rolling_volatility([100.0]) is None

    def test_constant_prices_yield_zero_vol(self):
        values = [100.0] * 30
        result = compute_rolling_volatility(values)
        assert result == pytest.approx(0.0)

    def test_positive_volatility_for_varying_prices(self):
        values = [100.0, 102.0, 98.0, 101.0, 99.0, 103.0]
        result = compute_rolling_volatility(values)
        assert result is not None
        assert result > 0.0

    def test_annualization_factor(self):
        """Verify volatility is annualized with sqrt(252)."""
        # Two prices: 100, 110 => one log return = ln(1.1) ~ 0.0953
        # Std dev of a single return is undefined (n-1=0), so need at least 3 values
        values = [100.0, 110.0, 100.0]
        result = compute_rolling_volatility(values)
        assert result is not None
        # Daily returns: ln(1.1), ln(100/110)
        r1 = math.log(110.0 / 100.0)
        r2 = math.log(100.0 / 110.0)
        mean = (r1 + r2) / 2
        var = ((r1 - mean) ** 2 + (r2 - mean) ** 2) / 1
        expected = math.sqrt(var) * math.sqrt(252)
        assert result == pytest.approx(expected, rel=1e-6)


class TestComputeDrawdown:
    """Tests for the drawdown helper."""

    def test_returns_none_for_empty_list(self):
        assert compute_drawdown([]) is None

    def test_no_drawdown_at_peak(self):
        """Current price equals peak => 0% drawdown."""
        values = [90.0, 95.0, 100.0]
        assert compute_drawdown(values) == pytest.approx(0.0)

    def test_10_percent_drawdown(self):
        values = [100.0, 95.0, 90.0]
        assert compute_drawdown(values) == pytest.approx(-0.10)

    def test_25_percent_drawdown(self):
        values = [100.0, 80.0, 75.0]
        assert compute_drawdown(values) == pytest.approx(-0.25)

    def test_recovery_reduces_drawdown(self):
        """Peak at 100, drop to 80, recover to 90 => 10% drawdown."""
        values = [100.0, 80.0, 90.0]
        assert compute_drawdown(values) == pytest.approx(-0.10)

    def test_returns_none_for_zero_peak(self):
        assert compute_drawdown([0.0, 0.0]) is None


class TestEnergyGeoComposite:
    """Tests for the composite energy/geo score."""

    def test_all_at_midpoint_scores_50(self):
        config = ENERGY_GEO_CONFIG["scoring"]["energy_geo"]
        sub_scores = {
            "crude_level": 50.0,
            "crude_volatility": 50.0,
            "ewt_drawdown": 50.0,
        }
        score = compute_composite_score(sub_scores, config)
        assert score == 50.0

    def test_all_at_zero_scores_zero(self):
        config = ENERGY_GEO_CONFIG["scoring"]["energy_geo"]
        sub_scores = {
            "crude_level": 0.0,
            "crude_volatility": 0.0,
            "ewt_drawdown": 0.0,
        }
        score = compute_composite_score(sub_scores, config)
        assert score == 0.0

    def test_all_at_100_scores_100(self):
        config = ENERGY_GEO_CONFIG["scoring"]["energy_geo"]
        sub_scores = {
            "crude_level": 100.0,
            "crude_volatility": 100.0,
            "ewt_drawdown": 100.0,
        }
        score = compute_composite_score(sub_scores, config)
        assert score == 100.0

    def test_missing_crude_level_renormalizes(self):
        config = ENERGY_GEO_CONFIG["scoring"]["energy_geo"]
        sub_scores = {
            "crude_volatility": 50.0,
            "ewt_drawdown": 50.0,
        }
        score = compute_composite_score(sub_scores, config)
        # Remaining weights: 0.35 + 0.35 = 0.70
        # (50*0.35 + 50*0.35) / 0.70 = 35/0.70 = 50
        assert score == 50.0

    def test_missing_ewt_renormalizes(self):
        config = ENERGY_GEO_CONFIG["scoring"]["energy_geo"]
        sub_scores = {
            "crude_level": 100.0,
            "crude_volatility": 0.0,
        }
        score = compute_composite_score(sub_scores, config)
        # Weights: 0.30 + 0.35 = 0.65
        # (100*0.30 + 0*0.35) / 0.65 = 30/0.65 = 46.15
        assert score == pytest.approx(46.15, abs=0.01)

    def test_no_components_returns_none(self):
        config = ENERGY_GEO_CONFIG["scoring"]["energy_geo"]
        sub_scores = {}
        score = compute_composite_score(sub_scores, config)
        assert score is None

    def test_asymmetric_stress(self):
        config = ENERGY_GEO_CONFIG["scoring"]["energy_geo"]
        sub_scores = {
            "crude_level": 80.0,
            "crude_volatility": 30.0,
            "ewt_drawdown": 60.0,
        }
        score = compute_composite_score(sub_scores, config)
        # 80*0.30 + 30*0.35 + 60*0.35 = 24 + 10.5 + 21 = 55.5
        assert score == 55.5


class TestScoreEnergyGeoFromValues:
    """Tests for the pure scoring logic without DB access."""

    def test_all_at_midpoint(self):
        from scoring.energy_geo import score_energy_geo_from_values

        result = score_energy_geo_from_values(
            crude_value=85.0,         # linear_score(85, 50, 120) = 50
            crude_volatility=0.325,   # linear_score(0.325, 0.15, 0.50) = 50
            ewt_drawdown=-0.125,      # inverted_linear_score(-0.125, 0, -0.25) = 50
            config=ENERGY_GEO_CONFIG,
        )
        assert result == pytest.approx(50.0, abs=0.5)

    def test_all_none_returns_none(self):
        from scoring.energy_geo import score_energy_geo_from_values

        result = score_energy_geo_from_values(
            crude_value=None,
            crude_volatility=None,
            ewt_drawdown=None,
            config=ENERGY_GEO_CONFIG,
        )
        assert result is None

    def test_missing_crude_volatility(self):
        from scoring.energy_geo import score_energy_geo_from_values

        result = score_energy_geo_from_values(
            crude_value=85.0,         # 50
            crude_volatility=None,
            ewt_drawdown=-0.125,      # 50
            config=ENERGY_GEO_CONFIG,
        )
        # Weights: 0.30 + 0.35 = 0.65
        # (50*0.30 + 50*0.35) / 0.65 = 32.5/0.65 = 50
        assert result == pytest.approx(50.0, abs=0.5)

    def test_high_stress(self):
        from scoring.energy_geo import score_energy_geo_from_values

        result = score_energy_geo_from_values(
            crude_value=120.0,        # 100
            crude_volatility=0.50,    # 100
            ewt_drawdown=-0.25,       # 100
            config=ENERGY_GEO_CONFIG,
        )
        assert result == pytest.approx(100.0)

    def test_low_stress(self):
        from scoring.energy_geo import score_energy_geo_from_values

        result = score_energy_geo_from_values(
            crude_value=50.0,         # 0
            crude_volatility=0.15,    # 0
            ewt_drawdown=0.0,         # 0
            config=ENERGY_GEO_CONFIG,
        )
        assert result == pytest.approx(0.0)

    def test_missing_ewt_renormalizes(self):
        from scoring.energy_geo import score_energy_geo_from_values

        result = score_energy_geo_from_values(
            crude_value=120.0,        # 100
            crude_volatility=0.50,    # 100
            ewt_drawdown=None,
            config=ENERGY_GEO_CONFIG,
        )
        # Weights: 0.30 + 0.35 = 0.65
        # (100*0.30 + 100*0.35) / 0.65 = 65/0.65 = 100
        assert result == pytest.approx(100.0)

    def test_mixed_stress_levels(self):
        from scoring.energy_geo import score_energy_geo_from_values

        result = score_energy_geo_from_values(
            crude_value=85.0,         # 50
            crude_volatility=0.50,    # 100
            ewt_drawdown=0.0,         # 0
            config=ENERGY_GEO_CONFIG,
        )
        # 50*0.30 + 100*0.35 + 0*0.35 = 15 + 35 + 0 = 50
        assert result == pytest.approx(50.0, abs=0.5)


class TestRollingVolatilityEdgeCases:
    """Edge cases for compute_rolling_volatility with zero/negative values."""

    def test_series_with_some_zero_values(self):
        """Zero values in the middle of a series are skipped in log returns."""
        values = [100.0, 0.0, 100.0, 105.0]
        # Pairs: (100,0) skipped (0 not >0), (0,100) skipped (0 not >0), (100,105) valid
        # Only 1 log return -> needs at least 2 -> returns None
        result = compute_rolling_volatility(values)
        assert result is None

    def test_series_with_some_negative_values(self):
        """Negative values are skipped in log returns."""
        values = [100.0, -50.0, 100.0, 105.0, 110.0]
        # Pairs: (100,-50) skip, (-50,100) skip, (100,105) valid, (105,110) valid
        # 2 log returns -> can compute
        result = compute_rolling_volatility(values)
        assert result is not None
        assert result > 0.0

    def test_all_zero_series_returns_none(self):
        """All-zero series produces no valid log returns."""
        values = [0.0, 0.0, 0.0, 0.0, 0.0]
        result = compute_rolling_volatility(values)
        assert result is None
