"""Entrypoint for the correlation service.

Runs domain index computation and scoring on a repeating schedule.
"""

import logging
import os
import sys
import time

from index_builder import compute_domain_indices
from scoring.private_credit import score_private_credit, load_scoring_config

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
            score = score_private_credit(db_url, scoring_config)
            logger.info("Private Credit Stress score: %.2f", score)
        except Exception:
            logger.exception("Private Credit scoring failed")

        time.sleep(interval)


if __name__ == "__main__":
    main()
