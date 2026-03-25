import warnings
from pathlib import Path

import psycopg2
import pytest
from testcontainers.postgres import PostgresContainer

_INIT_SQL = Path(__file__).resolve().parent.parent / "db" / "init.sql"


def _apply_init_sql(connection_url: str) -> None:
    """Apply the TimescaleDB schema from init.sql."""
    conn = psycopg2.connect(connection_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(_INIT_SQL.read_text())
    finally:
        conn.close()


def pytest_configure(config):
    config.addinivalue_line("markers", "e2e: end-to-end tests requiring Docker")
    config.addinivalue_line("markers", "integration: integration tests requiring Docker")


@pytest.fixture(scope="session")
def timescale_container():
    container = PostgresContainer(
        image="timescale/timescaledb:latest-pg16",
        username="risk",
        password="testpassword",
        dbname="riskmonitor",
    )
    try:
        container.start()
        url = container.get_connection_url(driver=None)
        _apply_init_sql(url)
        yield container
    finally:
        try:
            container.stop()
        except Exception as exc:
            warnings.warn(
                f"Failed to stop TimescaleDB container during teardown: {exc}",
                stacklevel=1,
            )


@pytest.fixture(scope="session")
def db_url(timescale_container):
    url = timescale_container.get_connection_url(driver=None)
    return url + ("&" if "?" in url else "?") + "sslmode=disable"
