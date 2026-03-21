"""Unit tests for domain index construction.

Tests daily return computation, equal-weight averaging, and missing data handling.
"""

import math
from datetime import datetime, timezone

import pandas as pd
import pytest

# The module under test -- will be implemented in GREEN phase
from index_builder import (
    INDEX_DEFINITIONS,
    compute_daily_returns,
    compute_index_returns,
    build_price_dataframe,
)


class TestComputeDailyReturns:
    """Tests for computing daily returns from a price series."""

    def test_returns_from_sequential_prices(self):
        """Daily return = (price_today - price_yesterday) / price_yesterday."""
        prices = pd.Series(
            [100.0, 105.0, 102.0],
            index=pd.to_datetime(["2025-01-01", "2025-01-02", "2025-01-03"]),
        )
        returns = compute_daily_returns(prices)

        # First day has no previous price, so return is NaN
        assert math.isnan(returns.iloc[0])
        # 105/100 - 1 = 0.05
        assert returns.iloc[1] == pytest.approx(0.05)
        # 102/105 - 1 = -0.02857...
        assert returns.iloc[2] == pytest.approx((102.0 - 105.0) / 105.0)

    def test_single_price_returns_nan(self):
        """A single price point cannot produce a return."""
        prices = pd.Series([50.0], index=pd.to_datetime(["2025-01-01"]))
        returns = compute_daily_returns(prices)
        assert len(returns) == 1
        assert math.isnan(returns.iloc[0])

    def test_empty_series_returns_empty(self):
        """Empty input produces empty output."""
        prices = pd.Series([], dtype=float)
        returns = compute_daily_returns(prices)
        assert len(returns) == 0

    def test_zero_price_returns_inf_or_nan(self):
        """Division by zero price should produce inf (pandas default behavior)."""
        prices = pd.Series(
            [0.0, 100.0],
            index=pd.to_datetime(["2025-01-01", "2025-01-02"]),
        )
        returns = compute_daily_returns(prices)
        # 0 -> 100: (100 - 0) / 0 = inf
        assert math.isinf(returns.iloc[1])


class TestBuildPriceDataframe:
    """Tests for building a pivoted price dataframe from raw DB rows."""

    def test_pivots_rows_into_ticker_columns(self):
        rows = [
            {"time": datetime(2025, 1, 1, tzinfo=timezone.utc), "ticker": "A", "value": 10.0},
            {"time": datetime(2025, 1, 1, tzinfo=timezone.utc), "ticker": "B", "value": 20.0},
            {"time": datetime(2025, 1, 2, tzinfo=timezone.utc), "ticker": "A", "value": 11.0},
            {"time": datetime(2025, 1, 2, tzinfo=timezone.utc), "ticker": "B", "value": 22.0},
        ]
        df = build_price_dataframe(rows)

        assert list(df.columns) == ["A", "B"]
        assert len(df) == 2
        assert df.loc[df.index[0], "A"] == 10.0
        assert df.loc[df.index[1], "B"] == 22.0

    def test_missing_ticker_on_some_days_produces_nan(self):
        rows = [
            {"time": datetime(2025, 1, 1, tzinfo=timezone.utc), "ticker": "A", "value": 10.0},
            {"time": datetime(2025, 1, 1, tzinfo=timezone.utc), "ticker": "B", "value": 20.0},
            {"time": datetime(2025, 1, 2, tzinfo=timezone.utc), "ticker": "A", "value": 11.0},
            # B missing on day 2
        ]
        df = build_price_dataframe(rows)
        assert math.isnan(df.loc[df.index[1], "B"])

    def test_empty_rows_returns_empty_dataframe(self):
        df = build_price_dataframe([])
        assert df.empty


class TestComputeIndexReturns:
    """Tests for computing equal-weighted index returns from constituent prices."""

    def test_equal_weight_average_of_two_tickers(self):
        """Index return = mean of constituent daily returns."""
        # Day 0: A=100, B=200
        # Day 1: A=110, B=210
        # Return A = 0.10, Return B = 0.05
        # Index = (0.10 + 0.05) / 2 = 0.075
        rows = [
            {"time": datetime(2025, 1, 1, tzinfo=timezone.utc), "ticker": "A", "value": 100.0},
            {"time": datetime(2025, 1, 1, tzinfo=timezone.utc), "ticker": "B", "value": 200.0},
            {"time": datetime(2025, 1, 2, tzinfo=timezone.utc), "ticker": "A", "value": 110.0},
            {"time": datetime(2025, 1, 2, tzinfo=timezone.utc), "ticker": "B", "value": 210.0},
        ]
        price_df = build_price_dataframe(rows)
        result = compute_index_returns(price_df, ["A", "B"])

        # Day 0 is NaN (no previous price)
        assert math.isnan(result.iloc[0])
        # Day 1: mean of (0.10, 0.05) = 0.075
        assert result.iloc[1] == pytest.approx(0.075)

    def test_skips_missing_ticker_in_average(self):
        """If one ticker has no data for a day, compute index from available ones."""
        rows = [
            {"time": datetime(2025, 1, 1, tzinfo=timezone.utc), "ticker": "A", "value": 100.0},
            {"time": datetime(2025, 1, 1, tzinfo=timezone.utc), "ticker": "B", "value": 200.0},
            {"time": datetime(2025, 1, 2, tzinfo=timezone.utc), "ticker": "A", "value": 110.0},
            # B missing on day 2
        ]
        price_df = build_price_dataframe(rows)
        result = compute_index_returns(price_df, ["A", "B"])

        # Day 1: only A has a return (0.10), B is NaN -> index = 0.10
        assert result.iloc[1] == pytest.approx(0.10)

    def test_single_ticker_index(self):
        """Energy index with single ticker: index return = that ticker's return."""
        rows = [
            {"time": datetime(2025, 1, 1, tzinfo=timezone.utc), "ticker": "CL=F", "value": 75.0},
            {"time": datetime(2025, 1, 2, tzinfo=timezone.utc), "ticker": "CL=F", "value": 76.5},
        ]
        price_df = build_price_dataframe(rows)
        result = compute_index_returns(price_df, ["CL=F"])

        assert result.iloc[1] == pytest.approx((76.5 - 75.0) / 75.0)

    def test_all_tickers_missing_returns_nan(self):
        """If no tickers have data, index return is NaN."""
        rows = [
            {"time": datetime(2025, 1, 1, tzinfo=timezone.utc), "ticker": "A", "value": 100.0},
            # Day 2: no data for any ticker
        ]
        price_df = build_price_dataframe(rows)
        # Request tickers that exist on day 1 only
        result = compute_index_returns(price_df, ["A"])
        # Only one day of data, so only NaN (no previous price for return)
        assert len(result) == 1
        assert math.isnan(result.iloc[0])

    def test_three_day_series_produces_two_returns(self):
        """With 3 days of prices, we get 2 meaningful return values."""
        rows = [
            {"time": datetime(2025, 1, 1, tzinfo=timezone.utc), "ticker": "X", "value": 100.0},
            {"time": datetime(2025, 1, 2, tzinfo=timezone.utc), "ticker": "X", "value": 110.0},
            {"time": datetime(2025, 1, 3, tzinfo=timezone.utc), "ticker": "X", "value": 105.0},
        ]
        price_df = build_price_dataframe(rows)
        result = compute_index_returns(price_df, ["X"])

        assert len(result) == 3
        assert math.isnan(result.iloc[0])
        assert result.iloc[1] == pytest.approx(0.10)
        assert result.iloc[2] == pytest.approx((105.0 - 110.0) / 110.0)


class TestIndexDefinitions:
    """Tests that index definitions are correctly configured."""

    def test_private_credit_index_has_four_tickers(self):
        defn = INDEX_DEFINITIONS["IDX_PRIVATE_CREDIT"]
        assert set(defn) == {"OWL", "ARCC", "BXSL", "OBDC"}

    def test_ai_tech_index_has_five_tickers(self):
        defn = INDEX_DEFINITIONS["IDX_AI_TECH"]
        assert set(defn) == {"NVDA", "MSFT", "GOOGL", "META", "AMZN"}

    def test_energy_index_has_one_ticker(self):
        defn = INDEX_DEFINITIONS["IDX_ENERGY"]
        assert defn == ["CL=F"]

    def test_all_three_indices_defined(self):
        assert set(INDEX_DEFINITIONS.keys()) == {
            "IDX_PRIVATE_CREDIT",
            "IDX_AI_TECH",
            "IDX_ENERGY",
        }
