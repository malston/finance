# E2E Test Database Isolation via testcontainers-python

**Issue:** #25
**Date:** 2026-03-23

## Problem

`test_e2e_staleness.py` deletes all `time_series` rows for common tickers regardless of `source` in its cleanup fixture. If run against a shared or non-ephemeral database, this deletes real data and disrupts other services.

## Solution

Replace the `DATABASE_URL` env var requirement with an ephemeral TimescaleDB container provisioned by `testcontainers-python`. Each test module run gets its own isolated database that is destroyed on teardown.

## Changes

### 1. Add `testcontainers[postgres]` to `requirements.txt`

Adds the testcontainers package with the Postgres module. psycopg2 (already a dependency) is used by the container's readiness check.

### 2. Add `@pytest.mark.e2e` marker to all test classes

Register `e2e` as a custom marker in a `conftest.py` (or `pyproject.toml`) and apply it to the test module. This ensures `pytest -k "not e2e"` excludes the file and machines without Docker skip gracefully instead of failing hard during unit-only runs.

### 3. Replace `db_url` fixture in `test_e2e_staleness.py`

**Before:**

```python
@pytest.fixture(scope="module")
def db_url():
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL not set; e2e tests require a running TimescaleDB")
    return url
```

**After:**

```python
_INIT_SQL = Path(__file__).resolve().parent.parent / "db" / "init.sql"

@pytest.fixture(scope="module")
def timescale_container():
    container = PostgresContainer(
        image="timescale/timescaledb:latest-pg16",
        username="risk",
        password="testpassword",
        dbname="riskmonitor",
    )
    container.start()
    _apply_init_sql(container.get_connection_url(driver=None))
    yield container
    container.stop()

@pytest.fixture(scope="module")
def db_url(timescale_container):
    url = timescale_container.get_connection_url(driver=None)
    # Append sslmode=disable -- local containers have no SSL configured
    return url + ("&" if "?" in url else "?") + "sslmode=disable"
```

Key details:

- **`driver=None`**: `get_connection_url()` defaults to returning a SQLAlchemy-style URL (`postgresql+psycopg2://...`). All scorers pass `db_url` to `psycopg2.connect()`, which expects a plain libpq URL (`postgresql://...`). Passing `driver=None` omits the driver suffix.
- **`sslmode=disable`**: Matches the Go integration test pattern. Prevents failures from psycopg2 builds that default to requiring SSL.
- **`_INIT_SQL` path**: Resolves `services/db/init.sql` relative to the test file location, same strategy as the Go tests' `initSQLPath()`.

### 4. Implement `_apply_init_sql` helper

```python
def _apply_init_sql(connection_url: str) -> None:
    """Apply the TimescaleDB schema from init.sql."""
    conn = psycopg2.connect(connection_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(_INIT_SQL.read_text())
    finally:
        conn.close()
```

psycopg2 handles multiple statements in a single `execute()` call. The `CREATE EXTENSION IF NOT EXISTS timescaledb` statement works because the container image (`timescale/timescaledb`) ships with the extension pre-installed.

### 5. No changes to test logic

All test classes, assertions, fixtures (`db_conn`, `clean_test_data`, `scoring_config`, `alert_config`, `data_timestamp`, `seed_market_data`) remain unchanged. They receive the ephemeral DB URL transparently through the existing fixture chain.

## What stays the same

- All 8 tests and their assertions
- Per-test cleanup via `clean_test_data` (safe since the DB is ephemeral)
- Scoring config, alert config, and data seeding fixtures
- Module-scoped connection lifecycle

## Dependencies

- Docker must be running (testcontainers requires a Docker daemon)
- `testcontainers[postgres]` package (new dependency)

## Future considerations

- If other integration test files adopt testcontainers, the `timescale_container` fixture should move to a shared `conftest.py` with `session` scope to avoid spinning up multiple containers.
- The `latest-pg16` tag is used for consistency with `docker-compose.yml`. Pinning to a specific version improves reproducibility but drifts from the compose file.

## Test running

```bash
cd services/correlation
python -m pytest test_e2e_staleness.py -v
```

No `DATABASE_URL` env var needed. Docker availability is the only prerequisite.

To exclude from unit-only runs:

```bash
python -m pytest -k "not e2e" -v
```
