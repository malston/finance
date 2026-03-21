"""Entrypoint for the correlation service.

Runs domain index computation on a repeating schedule.
"""

import logging
import os
import sys
import time

from correlator import compute_correlations
from index_builder import compute_domain_indices
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

        time.sleep(interval)


if __name__ == "__main__":
    main()
