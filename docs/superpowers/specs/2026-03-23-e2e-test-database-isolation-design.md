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

### 2. Replace `db_url` fixture in `test_e2e_staleness.py`

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
@pytest.fixture(scope="module")
def timescale_container():
    container = PostgresContainer(
        image="timescale/timescaledb:latest-pg16",
        username="risk",
        password="testpassword",
        dbname="riskmonitor",
    )
    container.start()
    # Apply schema
    _apply_init_sql(container.get_connection_url())
    yield container
    container.stop()

@pytest.fixture(scope="module")
def db_url(timescale_container):
    return timescale_container.get_connection_url()
```

The init.sql schema is applied via a direct psycopg2 connection after the container starts, using the same `services/db/init.sql` file that Docker Compose and the Go integration tests use.

### 3. Remove `DATABASE_URL` skip guard

The `pytest.skip("DATABASE_URL not set")` guard is removed. Tests self-provision their database and run unconditionally (Docker must be available).

### 4. No changes to test logic

All test classes, assertions, fixtures (`db_conn`, `clean_test_data`, `scoring_config`, `alert_config`, `data_timestamp`, `seed_market_data`) remain unchanged. They receive the ephemeral DB URL transparently through the existing fixture chain.

## What stays the same

- All 8 tests and their assertions
- Per-test cleanup via `clean_test_data` (safe since the DB is ephemeral)
- Scoring config, alert config, and data seeding fixtures
- Module-scoped connection lifecycle

## Dependencies

- Docker must be running (testcontainers requires a Docker daemon)
- `testcontainers[postgres]` package (new dependency)

## Test running

```bash
cd services/correlation
python -m pytest test_e2e_staleness.py -v
```

No `DATABASE_URL` env var needed. Docker availability is the only prerequisite.
