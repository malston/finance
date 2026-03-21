"""Entrypoint for the correlation service.

Runs domain index computation on a repeating schedule.
"""

import logging
import os
import sys
import time

from index_builder import compute_domain_indices

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
    logger.info("Starting correlation service, interval=%ds", interval)

    while True:
        try:
            compute_domain_indices(db_url)
        except Exception:
            logger.exception("Index computation failed")
        time.sleep(interval)


if __name__ == "__main__":
    main()
