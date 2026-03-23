"""Unit tests for Yardeni dual-ticker scoring.

Tests cover:
- ticker_prefix parameter propagation (write_score gets prefixed ticker)
- Yardeni thresholds produce different scores than Bookstaber for same inputs
- Yardeni composite reads YARDENI_SCORE_* tickers
- Yardeni config weights sum to 1.0
- Yardeni config composite domain tickers use YARDENI_ prefix
- _run_scoring_pass failure isolation (one scorer failing doesn't stop others)
"""

from unittest.mock import patch, MagicMock

import pytest
import yaml

from scoring.common import linear_score, compute_composite_score, load_scoring_config
from scoring.ai_concentration import score_ai_concentration_from_values
from scoring.contagion import score_contagion_from_values
from scoring.energy_geo import score_energy_geo_from_values
from scoring.composite import compute_composite_from_values
from run import _run_scoring_pass


# ---------------------------------------------------------------------------
# Config fixtures
# ---------------------------------------------------------------------------

BOOKSTABER_PRIVATE_CREDIT_CONFIG = {
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

YARDENI_PRIVATE_CREDIT_CONFIG = {
    "scoring": {
        "private_credit": {
            "weight": 0.25,
            "components": {
                "hy_spread": {
                    "sub_weight": 0.30,
                    "ticker": "BAMLH0A0HYM2",
                    "min_value": 350,
                    "max_value": 800,
                },
                "bdc_discount": {
                    "sub_weight": 0.20,
                    "ticker": "BDC_AVG_NAV_DISCOUNT",
                    "min_value": 0,
                    "max_value": -0.25,
                },
                "redemption_flow": {
                    "sub_weight": 0.15,
                    "placeholder": 35,
                },
                "spread_roc": {
                    "sub_weight": 0.35,
                    "ticker": "BAMLH0A0HYM2",
                    "min_value": 0,
                    "max_value": 75,
                    "lookback_days": 5,
                },
            },
        },
    },
}

BOOKSTABER_CONTAGION_CONFIG = {
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

YARDENI_CONTAGION_CONFIG = {
    "scoring": {
        "contagion": {
            "weight": 0.25,
            "components": {
                "max_correlation": {
                    "sub_weight": 0.50,
                    "min_value": 0.2,
                    "max_value": 0.85,
                },
                "vix_level": {
                    "sub_weight": 0.50,
                    "ticker": "VIXY",
                    "min_value": 18,
                    "max_value": 50,
                },
            },
        },
    },
}

BOOKSTABER_AI_CONFIG = {
    "scoring": {
        "ai_concentration": {
            "weight": 0.20,
            "components": {
                "spy_rsp_deviation": {
                    "sub_weight": 0.40,
                    "ticker": "SPY_RSP_RATIO",
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

YARDENI_AI_CONFIG = {
    "scoring": {
        "ai_concentration": {
            "weight": 0.20,
            "components": {
                "spy_rsp_deviation": {
                    "sub_weight": 0.35,
                    "ticker": "SPY_RSP_RATIO",
                    "min_deviation": 0,
                    "max_deviation": 0.20,
                },
                "smh_relative": {
                    "sub_weight": 0.30,
                    "ticker_a": "SMH",
                    "ticker_b": "SPY",
                    "min_value": 0,
                    "max_value": 0.25,
                },
                "top10_weight": {
                    "sub_weight": 0.35,
                    "ticker": "SPY_RSP_RATIO",
                    "min_value": 1.6,
                    "max_value": 3.0,
                },
            },
        },
    },
}

BOOKSTABER_ENERGY_CONFIG = {
    "scoring": {
        "energy_geo": {
            "weight": 0.25,
            "min_components": 2,
            "components": {
                "crude_level": {
                    "sub_weight": 0.30,
                    "ticker": "CL=F",
                    "min_value": 30,
                    "max_value": 120,
                },
                "crude_volatility": {
                    "sub_weight": 0.35,
                    "ticker": "CL=F",
                    "min_value": 0.15,
                    "max_value": 0.50,
                },
                "ewt_drawdown": {
                    "sub_weight": 0.35,
                    "ticker": "EWT",
                    "min_value": 0,
                    "max_value": -0.25,
                },
            },
        },
    },
}

YARDENI_ENERGY_CONFIG = {
    "scoring": {
        "energy_geo": {
            "weight": 0.30,
            "min_components": 2,
            "components": {
                "crude_level": {
                    "sub_weight": 0.25,
                    "ticker": "CL=F",
                    "min_value": 50,
                    "max_value": 140,
                },
                "crude_volatility": {
                    "sub_weight": 0.40,
                    "ticker": "CL=F",
                    "min_value": 0.20,
                    "max_value": 0.60,
                },
                "ewt_drawdown": {
                    "sub_weight": 0.35,
                    "ticker": "EWT",
                    "min_value": 0,
                    "max_value": -0.30,
                },
            },
        },
    },
}


# ---------------------------------------------------------------------------
# Test: Different thresholds produce different scores for same input
# ---------------------------------------------------------------------------


class TestDifferentThresholdsProduceDifferentScores:
    """Verify that Bookstaber and Yardeni configs produce different scores
    for identical input data, due to different thresholds."""

    def test_hy_spread_at_450_scores_differently(self):
        """linear_score(450, 300, 600) != linear_score(450, 350, 800)."""
        bookstaber = linear_score(450, 300, 600)  # (450-300)/(600-300)*100 = 50
        yardeni = linear_score(450, 350, 800)      # (450-350)/(800-350)*100 = 22.22
        assert bookstaber != yardeni
        assert bookstaber == pytest.approx(50.0)
        assert yardeni == pytest.approx(22.22, abs=0.01)

    def test_contagion_from_values_scores_differently(self):
        """Same correlation + VIX inputs produce different scores under each config."""
        bookstaber_score = score_contagion_from_values(0.5, 28.0, BOOKSTABER_CONTAGION_CONFIG)
        yardeni_score = score_contagion_from_values(0.5, 28.0, YARDENI_CONTAGION_CONFIG)
        assert bookstaber_score is not None
        assert yardeni_score is not None
        assert bookstaber_score != yardeni_score

    def test_ai_concentration_from_values_scores_differently(self):
        """Same SPY/RSP, SMH, SPY inputs produce different scores."""
        bookstaber_score = score_ai_concentration_from_values(
            1.8, 250.0, 500.0, BOOKSTABER_AI_CONFIG,
        )
        yardeni_score = score_ai_concentration_from_values(
            1.8, 250.0, 500.0, YARDENI_AI_CONFIG,
        )
        assert bookstaber_score is not None
        assert yardeni_score is not None
        assert bookstaber_score != yardeni_score

    def test_energy_geo_from_values_scores_differently(self):
        """Same crude price, volatility, EWT drawdown produce different scores."""
        bookstaber_score = score_energy_geo_from_values(
            80.0, 0.30, -0.10, BOOKSTABER_ENERGY_CONFIG,
        )
        yardeni_score = score_energy_geo_from_values(
            80.0, 0.30, -0.10, YARDENI_ENERGY_CONFIG,
        )
        assert bookstaber_score is not None
        assert yardeni_score is not None
        assert bookstaber_score != yardeni_score

    def test_private_credit_composite_scores_differently(self):
        """Same sub-scores produce different composites due to different sub_weights."""
        sub_scores = {
            "hy_spread": 50.0,
            "bdc_discount": 50.0,
            "redemption_flow": 50.0,
            "spread_roc": 50.0,
        }
        bookstaber_pc = BOOKSTABER_PRIVATE_CREDIT_CONFIG["scoring"]["private_credit"]
        yardeni_pc = YARDENI_PRIVATE_CREDIT_CONFIG["scoring"]["private_credit"]
        # All sub-scores are 50 so both composites will be 50 (weighted avg of 50s = 50).
        # Use asymmetric sub-scores to show the different sub_weights matter.
        asym_scores = {
            "hy_spread": 80.0,
            "bdc_discount": 20.0,
            "redemption_flow": 50.0,
            "spread_roc": 60.0,
        }
        bookstaber_result = compute_composite_score(asym_scores, bookstaber_pc)
        yardeni_result = compute_composite_score(asym_scores, yardeni_pc)
        assert bookstaber_result is not None
        assert yardeni_result is not None
        assert bookstaber_result != yardeni_result


# ---------------------------------------------------------------------------
# Test: ticker_prefix parameter on domain scorers
# ---------------------------------------------------------------------------


class TestTickerPrefixOnDomainScorers:
    """Verify each scorer's write_score call uses the ticker_prefix."""

    @patch("scoring.private_credit._fetch_value_days_ago")
    @patch("scoring.private_credit.psycopg2.connect")
    @patch("scoring.private_credit.write_score")
    @patch("scoring.private_credit.fetch_latest_value")
    def test_private_credit_writes_prefixed_ticker(
        self, mock_fetch, mock_write, mock_connect, mock_fetch_days,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        mock_fetch.return_value = 450.0
        mock_fetch_days.return_value = 400.0

        from scoring.private_credit import score_private_credit
        score_private_credit("fake_db_url", BOOKSTABER_PRIVATE_CREDIT_CONFIG, ticker_prefix="YARDENI_")

        mock_write.assert_called_once()
        written_ticker = mock_write.call_args[0][1]
        assert written_ticker == "YARDENI_SCORE_PRIVATE_CREDIT"

    @patch("scoring.private_credit._fetch_value_days_ago")
    @patch("scoring.private_credit.psycopg2.connect")
    @patch("scoring.private_credit.write_score")
    @patch("scoring.private_credit.fetch_latest_value")
    def test_private_credit_default_prefix_is_empty(
        self, mock_fetch, mock_write, mock_connect, mock_fetch_days,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        mock_fetch.return_value = 450.0
        mock_fetch_days.return_value = 400.0

        from scoring.private_credit import score_private_credit
        score_private_credit("fake_db_url", BOOKSTABER_PRIVATE_CREDIT_CONFIG)

        mock_write.assert_called_once()
        written_ticker = mock_write.call_args[0][1]
        assert written_ticker == "SCORE_PRIVATE_CREDIT"

    @patch("scoring.ai_concentration.psycopg2.connect")
    @patch("scoring.ai_concentration.write_score")
    @patch("scoring.ai_concentration.fetch_latest_value")
    def test_ai_concentration_writes_prefixed_ticker(
        self, mock_fetch, mock_write, mock_connect,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        mock_fetch.return_value = 1.8  # SPY_RSP_RATIO

        from scoring.ai_concentration import score_ai_concentration
        score_ai_concentration("fake_db_url", BOOKSTABER_AI_CONFIG, ticker_prefix="YARDENI_")

        mock_write.assert_called_once()
        written_ticker = mock_write.call_args[0][1]
        assert written_ticker == "YARDENI_SCORE_AI_CONCENTRATION"

    @patch("scoring.energy_geo.psycopg2.connect")
    @patch("scoring.energy_geo.write_score")
    @patch("scoring.energy_geo.fetch_latest_value")
    @patch("scoring.energy_geo._fetch_daily_values")
    def test_energy_geo_writes_prefixed_ticker(
        self, mock_daily, mock_fetch, mock_write, mock_connect,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        mock_fetch.return_value = 80.0
        # Provide enough daily values for volatility and drawdown computation
        mock_daily.return_value = [78.0, 79.0, 80.0, 81.0, 80.0, 79.5, 80.0]

        from scoring.energy_geo import score_energy_geo
        score_energy_geo("fake_db_url", BOOKSTABER_ENERGY_CONFIG, ticker_prefix="YARDENI_")

        mock_write.assert_called_once()
        written_ticker = mock_write.call_args[0][1]
        assert written_ticker == "YARDENI_SCORE_ENERGY_GEO"

    @patch("scoring.contagion.psycopg2.connect")
    @patch("scoring.contagion.write_score")
    @patch("scoring.contagion.fetch_latest_value")
    def test_contagion_writes_prefixed_ticker(
        self, mock_fetch, mock_write, mock_connect,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        # Return values for correlation tickers and VIX
        mock_fetch.side_effect = [0.5, 0.3, 0.2, 28.0]

        from scoring.contagion import score_contagion
        score_contagion("fake_db_url", BOOKSTABER_CONTAGION_CONFIG, ticker_prefix="YARDENI_")

        mock_write.assert_called_once()
        written_ticker = mock_write.call_args[0][1]
        assert written_ticker == "YARDENI_SCORE_CONTAGION"

    @patch("scoring.composite.psycopg2.connect")
    @patch("scoring.composite.write_score")
    @patch("scoring.composite.fetch_latest_with_time")
    def test_composite_writes_prefixed_ticker(
        self, mock_fetch, mock_write, mock_connect,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        from datetime import datetime, timezone
        ts = datetime(2026, 3, 21, 16, 0, 0, tzinfo=timezone.utc)
        # Return (value, timestamp) tuples for each domain
        mock_fetch.side_effect = [(60.0, ts), (50.0, ts), (70.0, ts), (55.0, ts)]

        from scoring.composite import score_composite
        yardeni_composite_config = {
            "scoring": {
                "composite": {
                    "domains": {
                        "private_credit": {
                            "ticker": "YARDENI_SCORE_PRIVATE_CREDIT",
                            "weight": 0.25,
                        },
                        "ai_concentration": {
                            "ticker": "YARDENI_SCORE_AI_CONCENTRATION",
                            "weight": 0.20,
                        },
                        "energy_geo": {
                            "ticker": "YARDENI_SCORE_ENERGY_GEO",
                            "weight": 0.30,
                        },
                        "contagion": {
                            "ticker": "YARDENI_SCORE_CONTAGION",
                            "weight": 0.25,
                        },
                    },
                    "threat_levels": [
                        {"max_score": 30, "level": "LOW", "color": "#22c55e"},
                        {"max_score": 55, "level": "ELEVATED", "color": "#eab308"},
                        {"max_score": 80, "level": "HIGH", "color": "#f97316"},
                        {"max_score": 100, "level": "CRITICAL", "color": "#ef4444"},
                    ],
                },
            },
        }
        score_composite("fake_db_url", yardeni_composite_config, ticker_prefix="YARDENI_")

        mock_write.assert_called_once()
        written_ticker = mock_write.call_args[0][1]
        assert written_ticker == "YARDENI_SCORE_COMPOSITE"


# ---------------------------------------------------------------------------
# Test: Yardeni composite reads YARDENI_SCORE_* tickers
# ---------------------------------------------------------------------------


class TestYardeniCompositeReadsPrefixedTickers:
    """Verify that score_composite with Yardeni config reads YARDENI_SCORE_* tickers."""

    @patch("scoring.composite.psycopg2.connect")
    @patch("scoring.composite.write_score")
    @patch("scoring.composite.fetch_latest_with_time")
    def test_reads_yardeni_prefixed_domain_tickers(
        self, mock_fetch, mock_write, mock_connect,
    ):
        mock_conn = MagicMock()
        mock_connect.return_value = mock_conn
        from datetime import datetime, timezone
        ts = datetime(2026, 3, 21, 16, 0, 0, tzinfo=timezone.utc)
        mock_fetch.side_effect = [(60.0, ts), (50.0, ts), (70.0, ts), (55.0, ts)]

        yardeni_composite_config = {
            "scoring": {
                "composite": {
                    "domains": {
                        "private_credit": {
                            "ticker": "YARDENI_SCORE_PRIVATE_CREDIT",
                            "weight": 0.25,
                        },
                        "ai_concentration": {
                            "ticker": "YARDENI_SCORE_AI_CONCENTRATION",
                            "weight": 0.20,
                        },
                        "energy_geo": {
                            "ticker": "YARDENI_SCORE_ENERGY_GEO",
                            "weight": 0.30,
                        },
                        "contagion": {
                            "ticker": "YARDENI_SCORE_CONTAGION",
                            "weight": 0.25,
                        },
                    },
                    "threat_levels": [
                        {"max_score": 30, "level": "LOW", "color": "#22c55e"},
                        {"max_score": 55, "level": "ELEVATED", "color": "#eab308"},
                        {"max_score": 80, "level": "HIGH", "color": "#f97316"},
                        {"max_score": 100, "level": "CRITICAL", "color": "#ef4444"},
                    ],
                },
            },
        }

        from scoring.composite import score_composite
        score_composite("fake_db_url", yardeni_composite_config, ticker_prefix="YARDENI_")

        # Verify fetch_latest_with_time was called with YARDENI_SCORE_* tickers
        fetch_calls = mock_fetch.call_args_list
        fetched_tickers = [call[0][1] for call in fetch_calls]
        assert "YARDENI_SCORE_PRIVATE_CREDIT" in fetched_tickers
        assert "YARDENI_SCORE_AI_CONCENTRATION" in fetched_tickers
        assert "YARDENI_SCORE_ENERGY_GEO" in fetched_tickers
        assert "YARDENI_SCORE_CONTAGION" in fetched_tickers


# ---------------------------------------------------------------------------
# Test: Yardeni config file validation
# ---------------------------------------------------------------------------


class TestYardeniConfigValidation:
    """Validate the Yardeni scoring config file."""

    @pytest.fixture()
    def yardeni_config(self):
        import os
        config_path = os.path.join(
            os.path.dirname(__file__),
            "..",
            "scoring_config_yardeni.yaml",
        )
        return load_scoring_config(config_path)

    def test_composite_weights_sum_to_one(self, yardeni_config):
        domains = yardeni_config["scoring"]["composite"]["domains"]
        total = sum(d["weight"] for d in domains.values())
        assert total == pytest.approx(1.0)

    def test_composite_private_credit_ticker_is_prefixed(self, yardeni_config):
        ticker = yardeni_config["scoring"]["composite"]["domains"]["private_credit"]["ticker"]
        assert ticker == "YARDENI_SCORE_PRIVATE_CREDIT"

    def test_composite_ai_concentration_ticker_is_prefixed(self, yardeni_config):
        ticker = yardeni_config["scoring"]["composite"]["domains"]["ai_concentration"]["ticker"]
        assert ticker == "YARDENI_SCORE_AI_CONCENTRATION"

    def test_composite_energy_geo_ticker_is_prefixed(self, yardeni_config):
        ticker = yardeni_config["scoring"]["composite"]["domains"]["energy_geo"]["ticker"]
        assert ticker == "YARDENI_SCORE_ENERGY_GEO"

    def test_composite_contagion_ticker_is_prefixed(self, yardeni_config):
        ticker = yardeni_config["scoring"]["composite"]["domains"]["contagion"]["ticker"]
        assert ticker == "YARDENI_SCORE_CONTAGION"

    def test_domain_weights_sum_to_one(self, yardeni_config):
        """Domain weights (private_credit + ai_concentration + energy_geo + contagion) sum to 1.0."""
        scoring = yardeni_config["scoring"]
        total = (
            scoring["private_credit"]["weight"]
            + scoring["ai_concentration"]["weight"]
            + scoring["energy_geo"]["weight"]
            + scoring["contagion"]["weight"]
        )
        assert total == pytest.approx(1.0)


# ---------------------------------------------------------------------------
# Test: _run_scoring_pass failure isolation
# ---------------------------------------------------------------------------


class TestRunScoringPassIsolation:
    """Verify that a failure in one scorer does not prevent others from running."""

    def test_failing_scorer_does_not_block_others(self):
        """When one scorer raises, the remaining scorers still execute."""
        call_log = []

        def scorer_ok(db_url, config, ticker_prefix=""):
            call_log.append("ok")
            return 50.0

        def scorer_fail(db_url, config, ticker_prefix=""):
            call_log.append("fail")
            raise RuntimeError("simulated failure")

        with patch("run._SCORERS", [
            (scorer_ok, "First"),
            (scorer_fail, "Broken"),
            (scorer_ok, "Third"),
            (scorer_ok, "Fourth"),
            (scorer_ok, "Fifth"),
        ]):
            _run_scoring_pass("fake://db", {}, "Test")

        assert call_log == ["ok", "fail", "ok", "ok", "ok"]

    def test_all_scorers_failing_does_not_raise(self):
        """If every scorer raises, _run_scoring_pass completes without raising."""
        def scorer_fail(db_url, config, ticker_prefix=""):
            raise RuntimeError("boom")

        with patch("run._SCORERS", [
            (scorer_fail, "A"),
            (scorer_fail, "B"),
        ]):
            _run_scoring_pass("fake://db", {}, "Test")

    def test_ticker_prefix_passed_to_scorers(self):
        """The ticker_prefix argument is forwarded to each scorer."""
        received_prefixes = []

        def scorer_capture(db_url, config, ticker_prefix=""):
            received_prefixes.append(ticker_prefix)
            return 42.0

        with patch("run._SCORERS", [
            (scorer_capture, "A"),
            (scorer_capture, "B"),
        ]):
            _run_scoring_pass("fake://db", {}, "Test", ticker_prefix="YARDENI_")

        assert received_prefixes == ["YARDENI_", "YARDENI_"]
