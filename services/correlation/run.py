"""Entrypoint for the correlation service.

Runs domain index computation, scoring, and alert evaluation on a repeating schedule.
"""

import logging
import os
import signal
import sys
import threading

import psycopg2

from alerting.dispatch import dispatch_alert, update_delivery_status
from alerting.rules_engine import evaluate_rules, load_alert_config
from correlator import compute_correlations
from index_builder import compute_domain_indices
from scoring.ai_concentration import score_ai_concentration
from scoring.common import load_scoring_config
from scoring.composite import score_composite
from scoring.contagion import score_contagion
from scoring.energy_geo import score_energy_geo
from scoring.private_credit import score_private_credit

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("correlation")


shutdown_event = threading.Event()


def _handle_shutdown(signum, frame):
    logger.info("Received signal %d, shutting down gracefully", signum)
    shutdown_event.set()


def main() -> None:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        logger.error("DATABASE_URL environment variable is required")
        sys.exit(1)

    interval = int(os.environ.get("COMPUTE_INTERVAL_SECONDS", "300"))
    scoring_config = load_scoring_config()

    yardeni_config_path = os.path.join(os.path.dirname(__file__), "scoring_config_yardeni.yaml")
    yardeni_config = load_scoring_config(yardeni_config_path)

    alert_config_path = os.path.join(os.path.dirname(__file__), "alert_config.yaml")
    alert_config = load_alert_config(alert_config_path)
    logger.info("Starting correlation service, interval=%ds", interval)

    signal.signal(signal.SIGTERM, _handle_shutdown)
    signal.signal(signal.SIGINT, _handle_shutdown)

    while not shutdown_event.is_set():
        try:
            compute_domain_indices(db_url)
        except Exception:
            logger.exception("Index computation failed")

        try:
            compute_correlations(db_url)
        except Exception:
            logger.exception("Correlation computation failed")

        try:
            pc_score = score_private_credit(db_url, scoring_config)
            if pc_score is not None:
                logger.info("Private credit score: %.2f", pc_score)
            else:
                logger.warning("Private credit score: skipped (insufficient data)")
        except Exception:
            logger.exception("Private credit scoring failed")

        try:
            ai_score = score_ai_concentration(db_url, scoring_config)
            if ai_score is not None:
                logger.info("AI concentration score: %.2f", ai_score)
            else:
                logger.warning("AI concentration score: skipped (insufficient data)")
        except Exception:
            logger.exception("AI concentration scoring failed")

        try:
            eg_score = score_energy_geo(db_url, scoring_config)
            if eg_score is not None:
                logger.info("Energy/geo score: %.2f", eg_score)
            else:
                logger.warning("Energy/geo score: skipped (insufficient data)")
        except Exception:
            logger.exception("Energy/geo scoring failed")

        try:
            contagion_score = score_contagion(db_url, scoring_config)
            if contagion_score is not None:
                logger.info("Contagion score: %.2f", contagion_score)
            else:
                logger.warning("Contagion score: skipped (insufficient data)")
        except Exception:
            logger.exception("Contagion scoring failed")

        try:
            composite_score = score_composite(db_url, scoring_config)
            if composite_score is not None:
                logger.info("Composite score: %.2f", composite_score)
            else:
                logger.warning("Composite score: skipped (insufficient data)")
        except Exception:
            logger.exception("Composite scoring failed")

        # Yardeni scoring pass
        try:
            ypc = score_private_credit(db_url, yardeni_config, ticker_prefix="YARDENI_")
            if ypc is not None:
                logger.info("Yardeni private credit score: %.2f", ypc)
            else:
                logger.warning("Yardeni private credit score: skipped (insufficient data)")
        except Exception:
            logger.exception("Yardeni private credit scoring failed")

        try:
            yai = score_ai_concentration(db_url, yardeni_config, ticker_prefix="YARDENI_")
            if yai is not None:
                logger.info("Yardeni AI concentration score: %.2f", yai)
            else:
                logger.warning("Yardeni AI concentration score: skipped (insufficient data)")
        except Exception:
            logger.exception("Yardeni AI concentration scoring failed")

        try:
            yeg = score_energy_geo(db_url, yardeni_config, ticker_prefix="YARDENI_")
            if yeg is not None:
                logger.info("Yardeni energy/geo score: %.2f", yeg)
            else:
                logger.warning("Yardeni energy/geo score: skipped (insufficient data)")
        except Exception:
            logger.exception("Yardeni energy/geo scoring failed")

        try:
            yct = score_contagion(db_url, yardeni_config, ticker_prefix="YARDENI_")
            if yct is not None:
                logger.info("Yardeni contagion score: %.2f", yct)
            else:
                logger.warning("Yardeni contagion score: skipped (insufficient data)")
        except Exception:
            logger.exception("Yardeni contagion scoring failed")

        try:
            ycomp = score_composite(db_url, yardeni_config, ticker_prefix="YARDENI_")
            if ycomp is not None:
                logger.info("Yardeni composite score: %.2f", ycomp)
            else:
                logger.warning("Yardeni composite score: skipped (insufficient data)")
        except Exception:
            logger.exception("Yardeni composite scoring failed")

        try:
            fired = evaluate_rules(db_url, alert_config)
            if fired:
                logger.info("Fired %d alert(s): %s", len(fired),
                            ", ".join(a["rule_id"] for a in fired))
                channels_config = alert_config.get("channels", {})
                for alert in fired:
                    try:
                        results = dispatch_alert(alert, channels_config)
                        logger.info("Dispatched alert %s: %s",
                                    alert["rule_id"], results)
                        conn = psycopg2.connect(db_url)
                        try:
                            update_delivery_status(
                                conn,
                                rule_id=alert["rule_id"],
                                channel_results=results,
                            )
                        finally:
                            conn.close()
                    except Exception:
                        logger.exception("Dispatch failed for alert %s",
                                         alert["rule_id"])
        except Exception:
            logger.exception("Alert evaluation failed")

        shutdown_event.wait(timeout=interval)


if __name__ == "__main__":
    main()
