"""Entrypoint for the correlation service.

Runs domain index computation, scoring, and alert evaluation on a repeating schedule.
"""

import logging
import os
import sys
import time

from alerting.dispatch import dispatch_alert
from alerting.rules_engine import evaluate_rules, load_alert_config
from correlator import compute_correlations
from index_builder import compute_domain_indices
from scoring.composite import score_composite
from scoring.contagion import score_contagion, load_scoring_config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("correlation")


def main() -> None:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        logger.error("DATABASE_URL environment variable is required")
        sys.exit(1)

    interval = int(os.environ.get("COMPUTE_INTERVAL_SECONDS", "300"))
    scoring_config = load_scoring_config()

    alert_config_path = os.path.join(os.path.dirname(__file__), "alert_config.yaml")
    alert_config = load_alert_config(alert_config_path)
    logger.info("Starting correlation service, interval=%ds", interval)

    while True:
        try:
            compute_domain_indices(db_url)
        except Exception:
            logger.exception("Index computation failed")

        try:
            compute_correlations(db_url)
        except Exception:
            logger.exception("Correlation computation failed")

        try:
            contagion_score = score_contagion(db_url, scoring_config)
            logger.info("Contagion score: %.2f", contagion_score)
        except Exception:
            logger.exception("Contagion scoring failed")

        try:
            composite_score = score_composite(db_url, scoring_config)
            logger.info("Composite score: %.2f", composite_score)
        except Exception:
            logger.exception("Composite scoring failed")

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
                    except Exception:
                        logger.exception("Dispatch failed for alert %s",
                                         alert["rule_id"])
        except Exception:
            logger.exception("Alert evaluation failed")

        time.sleep(interval)


if __name__ == "__main__":
    main()
