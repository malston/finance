"""Unit tests for rolling 30-day Pearson correlation computation.

Tests correlation math, edge cases (insufficient data, constant series),
and the correlation pair definitions.
"""

import math
from datetime import datetime, timezone, timedelta

import numpy as np
import pandas as pd
import pytest

from correlator import (
    CORRELATION_PAIRS,
    ROLLING_WINDOW,
    compute_pairwise_correlations,
)


class TestCorrelationPairDefinitions:
    """Verify the three correlation pairs are correctly defined."""

    def test_three_pairs_defined(self):
        assert len(CORRELATION_PAIRS) == 3

    def test_credit_tech_pair(self):
        pair = CORRELATION_PAIRS["CORR_CREDIT_TECH"]
        assert pair == ("IDX_PRIVATE_CREDIT", "IDX_AI_TECH")

    def test_credit_energy_pair(self):
        pair = CORRELATION_PAIRS["CORR_CREDIT_ENERGY"]
        assert pair == ("IDX_PRIVATE_CREDIT", "IDX_ENERGY")

    def test_tech_energy_pair(self):
        pair = CORRELATION_PAIRS["CORR_TECH_ENERGY"]
        assert pair == ("IDX_AI_TECH", "IDX_ENERGY")

    def test_rolling_window_is_30(self):
        assert ROLLING_WINDOW == 30


class TestComputePairwiseCorrelations:
    """Tests for the pure correlation computation function."""

    def _make_index_data(self, n_days, seed_a=42, seed_b=99):
        """Build two Series of daily returns with known random seeds."""
        rng_a = np.random.default_rng(seed_a)
        rng_b = np.random.default_rng(seed_b)
        dates = pd.date_range("2025-01-01", periods=n_days, freq="D", tz="UTC")
        series_a = pd.Series(rng_a.normal(0, 0.01, n_days), index=dates)
        series_b = pd.Series(rng_b.normal(0, 0.01, n_days), index=dates)
        return series_a, series_b

    def test_perfectly_correlated_series(self):
        """Two identical series should have correlation 1.0."""
        dates = pd.date_range("2025-01-01", periods=35, freq="D", tz="UTC")
        rng = np.random.default_rng(42)
        values = rng.normal(0, 0.02, 35)
        series_a = pd.Series(values, index=dates)
        series_b = pd.Series(values, index=dates)

        result = compute_pairwise_correlations(series_a, series_b, window=30)

        # First valid correlation at index 29 (window-1)
        valid = result.dropna()
        assert len(valid) > 0
        for val in valid:
            assert val == pytest.approx(1.0, abs=1e-10)

    def test_perfectly_anticorrelated_series(self):
        """Negated series should have correlation -1.0."""
        dates = pd.date_range("2025-01-01", periods=35, freq="D", tz="UTC")
        rng = np.random.default_rng(42)
        values = rng.normal(0, 0.02, 35)
        series_a = pd.Series(values, index=dates)
        series_b = pd.Series(-values, index=dates)

        result = compute_pairwise_correlations(series_a, series_b, window=30)

        valid = result.dropna()
        assert len(valid) > 0
        for val in valid:
            assert val == pytest.approx(-1.0, abs=1e-10)

    def test_correlation_values_bounded(self):
        """All correlation values must be in [-1.0, 1.0]."""
        series_a, series_b = self._make_index_data(60)

        result = compute_pairwise_correlations(series_a, series_b, window=30)

        valid = result.dropna()
        assert len(valid) > 0
        for val in valid:
            assert -1.0 <= val <= 1.0

    def test_matches_numpy_corrcoef(self):
        """Rolling correlation at a specific point matches numpy.corrcoef."""
        series_a, series_b = self._make_index_data(40)

        result = compute_pairwise_correlations(series_a, series_b, window=30)

        # Check the correlation at the last point (index 39) using numpy
        # The window is [10..39] for the last 30 values
        a_window = series_a.values[10:40]
        b_window = series_b.values[10:40]
        expected = np.corrcoef(a_window, b_window)[0, 1]

        assert result.iloc[39] == pytest.approx(expected, abs=1e-10)

    def test_insufficient_data_produces_nan(self):
        """With fewer than window data points, all values are NaN."""
        dates = pd.date_range("2025-01-01", periods=20, freq="D", tz="UTC")
        rng = np.random.default_rng(42)
        series_a = pd.Series(rng.normal(0, 0.01, 20), index=dates)
        series_b = pd.Series(rng.normal(0, 0.01, 20), index=dates)

        result = compute_pairwise_correlations(series_a, series_b, window=30)

        # All 20 points should be NaN since window=30 > 20
        assert len(result) == 20
        assert result.isna().all()

    def test_exactly_window_size_produces_one_valid(self):
        """With exactly 30 data points, only the last value is valid."""
        dates = pd.date_range("2025-01-01", periods=30, freq="D", tz="UTC")
        rng_a = np.random.default_rng(42)
        rng_b = np.random.default_rng(99)
        series_a = pd.Series(rng_a.normal(0, 0.01, 30), index=dates)
        series_b = pd.Series(rng_b.normal(0, 0.01, 30), index=dates)

        result = compute_pairwise_correlations(series_a, series_b, window=30)

        valid = result.dropna()
        assert len(valid) == 1
        # The single valid point is at index 29
        assert not math.isnan(result.iloc[29])

    def test_constant_series_produces_nan(self):
        """Constant series has zero variance; correlation is undefined (NaN)."""
        dates = pd.date_range("2025-01-01", periods=35, freq="D", tz="UTC")
        series_a = pd.Series([0.01] * 35, index=dates)
        rng = np.random.default_rng(42)
        series_b = pd.Series(rng.normal(0, 0.01, 35), index=dates)

        result = compute_pairwise_correlations(series_a, series_b, window=30)

        # Where one series is constant, correlation should be NaN
        # Check position 29 onward (where window is full)
        for i in range(29, 35):
            assert math.isnan(result.iloc[i])

    def test_misaligned_dates_uses_intersection(self):
        """If series have different dates, only overlapping dates are used."""
        dates_a = pd.date_range("2025-01-01", periods=35, freq="D", tz="UTC")
        dates_b = pd.date_range("2025-01-05", periods=35, freq="D", tz="UTC")
        rng = np.random.default_rng(42)
        series_a = pd.Series(rng.normal(0, 0.01, 35), index=dates_a)
        series_b = pd.Series(rng.normal(0, 0.01, 35), index=dates_b)

        result = compute_pairwise_correlations(series_a, series_b, window=30)

        # Overlap is from Jan 5 to Feb 4 = 31 days -> 2 valid correlation values
        valid = result.dropna()
        assert len(valid) == 2

    def test_empty_series_returns_empty(self):
        """Empty input produces empty output."""
        series_a = pd.Series([], dtype=float)
        series_b = pd.Series([], dtype=float)

        result = compute_pairwise_correlations(series_a, series_b, window=30)

        assert len(result) == 0
