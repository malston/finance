"""Entrypoint for the correlation service.

Runs domain index computation, scoring, and alert evaluation on a repeating schedule.
"""

import logging
import os
import signal
import sys
import threading
from datetime import datetime, timezone
from typing import Any, Callable

import psycopg2

from alerting.dispatch import dispatch_alert, update_delivery_status
from alerting.rules_engine import evaluate_rules, load_alert_config
from correlator import compute_correlations
from index_builder import compute_domain_indices
from scoring.ai_concentration import score_ai_concentration
from scoring.common import get_staleness_hours, is_market_hours, load_scoring_config
from scoring.composite import score_composite
from scoring.contagion import score_contagion
from scoring.energy_geo import score_energy_geo
from scoring.private_credit import score_private_credit

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("correlation")

_SCORERS: list[tuple[Callable[..., float | None], str]] = [
    (score_private_credit, "Private credit"),
    (score_ai_concentration, "AI concentration"),
    (score_energy_geo, "Energy/geo"),
    (score_contagion, "Contagion"),
    (score_composite, "Composite"),
]


shutdown_event = threading.Event()


def _handle_shutdown(signum, frame):
    logger.info("Received signal %d, shutting down gracefully", signum)
    shutdown_event.set()


def _run_scoring_pass(
    db_url: str,
    config: dict[str, Any],
    label: str,
    ticker_prefix: str = "",
    staleness_hours: float = 2,
) -> None:
    """Run all 5 scorers with the given config and ticker prefix.

    Each scorer runs in its own try/except so a failure in one does not
    prevent the others from executing.
    """
    for scorer_fn, name in _SCORERS:
        try:
            score = scorer_fn(db_url, config, ticker_prefix=ticker_prefix, staleness_hours=staleness_hours)
            if score is not None:
                logger.info("%s %s score: %.2f", label, name.lower(), score)
            else:
                logger.warning(
                    "%s %s score: skipped (insufficient data)",
                    label, name.lower(),
                )
        except Exception:
            logger.exception("%s %s scoring failed", label, name.lower())


def main() -> None:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        logger.error("DATABASE_URL environment variable is required")
        sys.exit(1)

    interval = int(os.environ.get("COMPUTE_INTERVAL_SECONDS", "300"))
    scoring_config = load_scoring_config()

    yardeni_config_path = os.path.join(os.path.dirname(__file__), "scoring_config_yardeni.yaml")
    try:
        yardeni_config: dict[str, Any] | None = load_scoring_config(yardeni_config_path)
    except Exception:
        logger.exception(
            "Failed to load Yardeni scoring config from %s; Yardeni scoring disabled",
            yardeni_config_path,
        )
        yardeni_config = None

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

        now = datetime.now(timezone.utc)
        staleness_hours = get_staleness_hours(scoring_config, now=now)
        market_open = is_market_hours(scoring_config, now=now)
        logger.info(
            "Staleness policy: %sh (%s)",
            staleness_hours,
            "market hours" if market_open else "off-hours",
        )

        _run_scoring_pass(db_url, scoring_config, "Bookstaber", staleness_hours=staleness_hours)

        if yardeni_config is not None:
            yardeni_staleness_hours = get_staleness_hours(yardeni_config, now=now)
            _run_scoring_pass(db_url, yardeni_config, "Yardeni", ticker_prefix="YARDENI_", staleness_hours=yardeni_staleness_hours)

        if not market_open:
            logger.info("Off-hours: skipping alert evaluation")
            shutdown_event.wait(timeout=interval)
            continue

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
