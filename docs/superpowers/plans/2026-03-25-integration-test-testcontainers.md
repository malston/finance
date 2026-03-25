# Integration Test Testcontainers Conversion Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert 8 Python integration test files from manual `DATABASE_URL` setup to a shared testcontainers-python fixture, so all 61 integration tests run automatically with only Docker.

**Architecture:** Lift the `timescale_container` fixture from `test_e2e_staleness.py` into `conftest.py` with session scope. Each integration test file drops its local `db_url` fixture and inherits the shared one. Marker-based filtering (`@pytest.mark.integration`) replaces the old `pytest.skip` gating.

**Tech Stack:** Python, pytest, testcontainers-python, psycopg2, TimescaleDB

**Spec:** `docs/superpowers/specs/2026-03-25-integration-test-testcontainers-design.md`

---

## File Map

| File                                                              | Action | Responsibility                                                                                  |
| ----------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| `services/correlation/conftest.py`                                | Modify | Add `timescale_container`, `db_url`, `_apply_init_sql`, `integration` marker                    |
| `services/correlation/test_e2e_staleness.py`                      | Modify | Remove `timescale_container`, `db_url`, `_apply_init_sql`, `_INIT_SQL`                          |
| `services/correlation/test_integration.py`                        | Modify | Remove `db_url` fixture, `import os`; add `@pytest.mark.integration`                            |
| `services/correlation/test_correlator_integration.py`             | Modify | Remove `db_url` fixture, `import os`; add `@pytest.mark.integration`                            |
| `services/correlation/scoring/test_integration_private_credit.py` | Modify | Remove `db_url` fixture; add `@pytest.mark.integration`                                         |
| `services/correlation/scoring/test_integration_composite.py`      | Modify | Remove `db_url` fixture; add `@pytest.mark.integration`                                         |
| `services/correlation/scoring/test_integration_contagion.py`      | Modify | Remove `db_url` fixture; add `@pytest.mark.integration`                                         |
| `services/correlation/alerting/test_integration_rules_engine.py`  | Modify | Remove `db_url` fixture, redundant DDL; add `@pytest.mark.integration`                          |
| `services/correlation/alerting/test_dispatch_wiring.py`           | Modify | Remove `db_url` fixture, `import os`, redundant DDL; add `@pytest.mark.integration` to DB class |
| `services/correlation/scoring/test_fetch_latest_value.py`         | Modify | Replace 3 class-level `db_conn` with 1 module-level; add `@pytest.mark.integration`             |
| `Makefile`                                                        | Modify | Switch `py-test` to marker-based filter; update `py-test-all` help text                         |
| `CLAUDE.md`                                                       | Modify | Update Python test commands to reflect marker-based filtering                                   |

---

## Task 1: Add shared fixtures to conftest.py

**Files:**

- Modify: `services/correlation/conftest.py`

- [ ] **Step 1: Add imports and helper to conftest.py**

Add to `services/correlation/conftest.py`:

```python
import warnings
from pathlib import Path

import psycopg2
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
```

- [ ] **Step 2: Add session-scoped container and db_url fixtures**

Add below the helper:

```python
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
```

- [ ] **Step 3: Register the integration marker**

Add to the existing `pytest_configure` function:

```python
def pytest_configure(config):
    config.addinivalue_line("markers", "e2e: end-to-end tests requiring Docker")
    config.addinivalue_line("markers", "integration: integration tests requiring Docker")
```

- [ ] **Step 4: Verify conftest loads without errors**

Run: `cd services/correlation && . .venv/bin/activate && python -c "import conftest; print('OK')"`

Expected: `OK` (no import errors)

- [ ] **Step 5: Commit**

```bash
git add services/correlation/conftest.py
git commit -m "test: add shared testcontainers fixtures to conftest.py (#44)"
```

---

## Task 2: Remove duplicated fixtures from test_e2e_staleness.py

**Files:**

- Modify: `services/correlation/test_e2e_staleness.py`

- [ ] **Step 1: Remove `_INIT_SQL`, `_apply_init_sql`, `timescale_container`, and `db_url`**

Remove these lines from `test_e2e_staleness.py`:

```python
# DELETE: line 20 (testcontainers import)
from testcontainers.postgres import PostgresContainer

# DELETE: line 47 (path constant)
_INIT_SQL = Path(__file__).resolve().parent.parent / "db" / "init.sql"

# DELETE: lines 50-58 (helper function)
def _apply_init_sql(connection_url: str) -> None:
    """Apply the TimescaleDB schema from init.sql."""
    conn = psycopg2.connect(connection_url)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(_INIT_SQL.read_text())
    finally:
        conn.close()

# DELETE: lines 61-82 (timescale_container fixture)
@pytest.fixture(scope="module")
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
            import warnings
            warnings.warn(
                f"Failed to stop TimescaleDB container during teardown: {exc}",
                stacklevel=1,
            )

# DELETE: lines 85-88 (db_url fixture)
@pytest.fixture(scope="module")
def db_url(timescale_container):
    url = timescale_container.get_connection_url(driver=None)
    return url + ("&" if "?" in url else "?") + "sslmode=disable"
```

Also remove unused imports that were only needed by the deleted code:

- `from pathlib import Path` (only used by `_INIT_SQL`)
- `from testcontainers.postgres import PostgresContainer`

Keep: `import psycopg2` (still used by `db_conn`), `import os` (still used by `alert_config` fixture).

- [ ] **Step 2: Run E2E tests to verify they still pass**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v -m e2e`

Expected: 9 tests pass (4 classes, same as before). The `db_url` fixture is now resolved from conftest.py.

- [ ] **Step 3: Commit**

```bash
git add services/correlation/test_e2e_staleness.py
git commit -m "test: remove duplicated testcontainers fixtures from E2E tests (#44)"
```

---

## Task 3: Convert test_integration.py

**Files:**

- Modify: `services/correlation/test_integration.py`

- [ ] **Step 1: Remove `db_url` fixture and `import os`**

Remove these lines:

```python
import os

@pytest.fixture(scope="module")
def db_url():
    """Database URL from environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL environment variable is required for integration tests")
    return url
```

- [ ] **Step 2: Add `@pytest.mark.integration` to the test class**

```python
@pytest.mark.integration
class TestIntegrationComputeDomainIndices:
```

- [ ] **Step 3: Run the integration tests in this file**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v test_integration.py`

Expected: 7 tests pass. No `DATABASE_URL` skip messages.

- [ ] **Step 4: Commit**

```bash
git add services/correlation/test_integration.py
git commit -m "test: convert test_integration.py to shared testcontainers (#44)"
```

---

## Task 4: Convert test_correlator_integration.py

**Files:**

- Modify: `services/correlation/test_correlator_integration.py`

- [ ] **Step 1: Remove `db_url` fixture and `import os`**

Remove these lines:

```python
import os

@pytest.fixture(scope="module")
def db_url():
    """Database URL from environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL environment variable is required for integration tests")
    return url
```

- [ ] **Step 2: Add `@pytest.mark.integration` to the test class**

```python
@pytest.mark.integration
class TestIntegrationComputeCorrelations:
```

- [ ] **Step 3: Run the integration tests in this file**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v test_correlator_integration.py`

Expected: 8 tests pass. No `DATABASE_URL` skip messages.

- [ ] **Step 4: Commit**

```bash
git add services/correlation/test_correlator_integration.py
git commit -m "test: convert test_correlator_integration.py to shared testcontainers (#44)"
```

---

## Task 5: Convert scoring/test_integration_private_credit.py

**Files:**

- Modify: `services/correlation/scoring/test_integration_private_credit.py`

- [ ] **Step 1: Remove `db_url` fixture**

Remove these lines (keep `import os` -- it's used by the `config` fixture):

```python
@pytest.fixture(scope="module")
def db_url():
    """Database URL from environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL not set; integration tests require a running TimescaleDB")
    return url
```

- [ ] **Step 2: Add `@pytest.mark.integration` to the test class**

```python
@pytest.mark.integration
class TestIntegrationScorePrivateCredit:
```

- [ ] **Step 3: Run the integration tests in this file**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v scoring/test_integration_private_credit.py`

Expected: 6 tests pass. No `DATABASE_URL` skip messages.

- [ ] **Step 4: Commit**

```bash
git add services/correlation/scoring/test_integration_private_credit.py
git commit -m "test: convert test_integration_private_credit.py to shared testcontainers (#44)"
```

---

## Task 6: Convert scoring/test_integration_composite.py

**Files:**

- Modify: `services/correlation/scoring/test_integration_composite.py`

- [ ] **Step 1: Remove `db_url` fixture**

Remove these lines (keep `import os` -- it's used by the `config` fixture):

```python
@pytest.fixture(scope="module")
def db_url():
    """Database URL from environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL environment variable is required for integration tests")
    return url
```

- [ ] **Step 2: Add `@pytest.mark.integration` to the test class**

```python
@pytest.mark.integration
class TestIntegrationScoreComposite:
```

- [ ] **Step 3: Run the integration tests in this file**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v scoring/test_integration_composite.py`

Expected: 8 tests pass. No `DATABASE_URL` skip messages.

- [ ] **Step 4: Commit**

```bash
git add services/correlation/scoring/test_integration_composite.py
git commit -m "test: convert test_integration_composite.py to shared testcontainers (#44)"
```

---

## Task 7: Convert scoring/test_integration_contagion.py

**Files:**

- Modify: `services/correlation/scoring/test_integration_contagion.py`

- [ ] **Step 1: Remove `db_url` fixture**

Remove these lines (keep `import os` -- it's used by the `config` fixture):

```python
@pytest.fixture(scope="module")
def db_url():
    """Database URL from environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL environment variable is required for integration tests")
    return url
```

- [ ] **Step 2: Add `@pytest.mark.integration` to the test class**

```python
@pytest.mark.integration
class TestIntegrationScoreContagion:
```

- [ ] **Step 3: Run the integration tests in this file**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v scoring/test_integration_contagion.py`

Expected: 9 tests pass. No `DATABASE_URL` skip messages.

- [ ] **Step 4: Commit**

```bash
git add services/correlation/scoring/test_integration_contagion.py
git commit -m "test: convert test_integration_contagion.py to shared testcontainers (#44)"
```

---

## Task 8: Convert alerting/test_integration_rules_engine.py

**Files:**

- Modify: `services/correlation/alerting/test_integration_rules_engine.py`

- [ ] **Step 1: Remove `db_url` fixture**

Remove these lines (keep `import os` -- it's used by `CONFIG_PATH`):

```python
@pytest.fixture(scope="module")
def db_url():
    """Database URL from environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL not set; integration tests require a running TimescaleDB")
    return url
```

- [ ] **Step 2: Remove redundant DDL from `db_conn` fixture**

The `db_conn` fixture at lines 41-69 contains `CREATE TABLE IF NOT EXISTS` for `alert_state` and `alert_history`. These tables are already created by `init.sql` when the container starts. Simplify `db_conn` to:

```python
@pytest.fixture(scope="module")
def db_conn(db_url):
    """Shared database connection for the test module."""
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    yield conn
    conn.close()
```

- [ ] **Step 3: Add `@pytest.mark.integration` to the test class**

```python
@pytest.mark.integration
class TestIntegrationAlertRulesEngine:
```

- [ ] **Step 4: Run the integration tests in this file**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v alerting/test_integration_rules_engine.py`

Expected: 8 tests pass. No `DATABASE_URL` skip messages.

- [ ] **Step 5: Commit**

```bash
git add services/correlation/alerting/test_integration_rules_engine.py
git commit -m "test: convert test_integration_rules_engine.py to shared testcontainers (#44)"
```

---

## Task 9: Convert alerting/test_dispatch_wiring.py

**Files:**

- Modify: `services/correlation/alerting/test_dispatch_wiring.py`

- [ ] **Step 1: Remove `db_url` fixture, `import os`, and redundant DDL**

Remove `import os` (only used by `db_url` fixture).

Remove the `db_url` fixture:

```python
@pytest.fixture(scope="module")
def db_url():
    """Database URL from environment."""
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL environment variable is required for integration tests")
    return url
```

Simplify `db_conn` to remove DDL (same as Task 8):

```python
@pytest.fixture(scope="module")
def db_conn(db_url):
    """Shared database connection for the test module."""
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    yield conn
    conn.close()
```

- [ ] **Step 2: Add `@pytest.mark.integration` to `TestUpdateDeliveryStatus` only**

`TestDispatchAndRecord` does not use DB fixtures -- do NOT mark it.

```python
@pytest.mark.integration
class TestUpdateDeliveryStatus:
```

- [ ] **Step 3: Run the tests in this file**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v alerting/test_dispatch_wiring.py`

Expected: 4 tests pass (2 integration + 2 non-DB). No `DATABASE_URL` skip messages.

- [ ] **Step 4: Verify non-DB tests run without markers**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v -m "not integration and not e2e" alerting/test_dispatch_wiring.py`

Expected: 2 tests from `TestDispatchAndRecord` run and pass. 2 tests deselected.

- [ ] **Step 5: Commit**

```bash
git add services/correlation/alerting/test_dispatch_wiring.py
git commit -m "test: convert test_dispatch_wiring.py to shared testcontainers (#44)"
```

---

## Task 10: Convert scoring/test_fetch_latest_value.py

**Files:**

- Modify: `services/correlation/scoring/test_fetch_latest_value.py`

- [ ] **Step 1: Replace 3 class-level `db_conn` fixtures with 1 module-level fixture**

Remove the 3 class-level `db_conn` fixtures (inside `TestMaxAgeHoursValidation`, `TestStalenessLogging`, and `TestFetchLatestValueIntegration`).

Add a single module-level fixture at the top of the file, after the imports:

```python
import psycopg2


@pytest.fixture(scope="module")
def db_conn(db_url):
    """Shared database connection for the test module."""
    conn = psycopg2.connect(db_url)
    conn.autocommit = True
    yield conn
    conn.close()
```

Remove the `import os` that was inside each class-level `db_conn` fixture (the only place `os` was used). Keep `import psycopg2` at module level.

- [ ] **Step 2: Add `@pytest.mark.integration` to all 3 test classes**

```python
@pytest.mark.integration
class TestMaxAgeHoursValidation:

@pytest.mark.integration
class TestStalenessLogging:

@pytest.mark.integration
class TestFetchLatestValueIntegration:
```

- [ ] **Step 3: Run the tests in this file**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v scoring/test_fetch_latest_value.py`

Expected: 6 tests pass. No `DATABASE_URL` skip messages.

- [ ] **Step 4: Commit**

```bash
git add services/correlation/scoring/test_fetch_latest_value.py
git commit -m "test: convert test_fetch_latest_value.py to shared testcontainers (#44)"
```

---

## Task 11: Update Makefile and CLAUDE.md

**Files:**

- Modify: `Makefile`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `py-test` target to use marker-based filtering**

Change:

```makefile
py-test: ## Run Python unit tests only
	cd services/correlation && . .venv/bin/activate && \
		python -m pytest -v -k "not integration and not e2e"
```

To:

```makefile
py-test: ## Run Python unit tests only
	cd services/correlation && . .venv/bin/activate && \
		python -m pytest -v -m "not integration and not e2e"
```

- [ ] **Step 2: Update `py-test-all` help text**

Change:

```makefile
py-test-all: ## Run full Python test suite (E2E requires Docker; integration requires DATABASE_URL)
```

To:

```makefile
py-test-all: ## Run full Python test suite (requires Docker)
```

- [ ] **Step 3: Update CLAUDE.md Python test commands**

In the `Build and Test Commands > Python (Correlation Service)` section, change:

```bash
python -m pytest -v -k "not integration and not e2e"  # Unit tests only
python -m pytest -v                                                # Full suite (E2E requires Docker; integration requires DATABASE_URL)
```

To:

```bash
python -m pytest -v -m "not integration and not e2e"  # Unit tests only
python -m pytest -v                                    # Full suite (requires Docker)
```

- [ ] **Step 4: Commit**

```bash
git add Makefile CLAUDE.md
git commit -m "docs: update test commands for marker-based filtering (#44)"
```

---

## Task 12: Full verification

- [ ] **Step 1: Run all Python tests (unit + integration + E2E)**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v`

Expected: All 293+ tests pass. No `DATABASE_URL` skip messages. One container starts for the session.

- [ ] **Step 2: Verify unit-only mode skips container startup**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v -m "not integration and not e2e"`

Expected: Only unit tests run (~238 tests). No container starts. No "collected 0 items" warnings for integration files.

- [ ] **Step 3: Verify integration-only mode**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v -m integration`

Expected: Only integration tests run (~52 tests). One container starts.

- [ ] **Step 4: Verify E2E-only mode**

Run: `cd services/correlation && . .venv/bin/activate && python -m pytest -v -m e2e`

Expected: Only E2E tests run (9 tests). One container starts.

- [ ] **Step 5: Verify Makefile targets**

Run: `make py-test` and `make py-test-all`

Expected: `py-test` runs unit tests only. `py-test-all` runs full suite.
