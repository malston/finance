# E2E Test Database Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the shared DATABASE_URL dependency in `test_e2e_staleness.py` with an ephemeral TimescaleDB container via testcontainers-python.

**Architecture:** A new module-scoped pytest fixture spins up a TimescaleDB container, applies `init.sql`, and provides the connection URL to all existing fixtures. No test logic changes.

**Tech Stack:** testcontainers-python, psycopg2, pytest, TimescaleDB

**Spec:** `docs/superpowers/specs/2026-03-23-e2e-test-database-isolation-design.md`
**Issue:** #25

---

## File Map

| Action | File                                         | Responsibility                             |
| ------ | -------------------------------------------- | ------------------------------------------ |
| Modify | `services/correlation/requirements.txt`      | Add testcontainers dependency              |
| Modify | `services/correlation/test_e2e_staleness.py` | Replace db_url fixture with testcontainers |
| Create | `services/correlation/conftest.py`           | Register `e2e` pytest marker               |
| Modify | `Makefile`                                   | Update py-test-all help text               |
| Modify | `CLAUDE.md`                                  | Update Python test section                 |

---

### Task 1: Add testcontainers dependency

**Files:**

- Modify: `services/correlation/requirements.txt`

- [ ] **Step 1: Add `testcontainers[postgres]` to requirements.txt**

Add after the existing `psycopg2-binary` line:

```
testcontainers[postgres]>=4.0,<5.0
```

- [ ] **Step 2: Install and verify the dependency resolves**

Run:

```bash
cd services/correlation && . .venv/bin/activate && pip install -r requirements.txt
```

Expected: installs testcontainers and its dependencies without conflicts.

- [ ] **Step 3: Verify import works**

Run:

```bash
cd services/correlation && . .venv/bin/activate && python -c "from testcontainers.postgres import PostgresContainer; print('OK')"
```

Expected: prints `OK`.

- [ ] **Step 4: Commit**

```bash
git add services/correlation/requirements.txt
git commit -m "chore: add testcontainers[postgres] dependency for E2E test isolation"
```

---

### Task 2: Replace db_url fixture with testcontainers

**Files:**

- Modify: `services/correlation/test_e2e_staleness.py`

- [ ] **Step 1: Add imports and init.sql path constant**

At the top of `test_e2e_staleness.py`, add these imports (after the existing ones):

```python
from pathlib import Path
from testcontainers.postgres import PostgresContainer
```

Add after the existing `_ALL_TICKERS` list:

```python
_INIT_SQL = Path(__file__).resolve().parent.parent / "db" / "init.sql"
```

- [ ] **Step 2: Add `_apply_init_sql` helper function**

Add before the fixtures, after the constants:

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

- [ ] **Step 3: Replace `db_url` fixture with `timescale_container` + `db_url`**

Replace the existing `db_url` fixture:

```python
@pytest.fixture(scope="module")
def db_url():
    url = os.environ.get("DATABASE_URL")
    if not url:
        pytest.skip("DATABASE_URL not set; e2e tests require a running TimescaleDB")
    return url
```

With these two fixtures:

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
    url = container.get_connection_url(driver=None)
    _apply_init_sql(url)
    yield container
    container.stop()


@pytest.fixture(scope="module")
def db_url(timescale_container):
    url = timescale_container.get_connection_url(driver=None)
    return url + ("&" if "?" in url else "?") + "sslmode=disable"
```

- [ ] **Step 4: Remove the `os` import if no longer used**

Check if `os` is still used elsewhere in the file. It is -- `os.path.join` in the `alert_config` fixture (line 70). Keep the import.

- [ ] **Step 5: Add `@pytest.mark.e2e` to all test classes**

Add the marker decorator to each of the four test classes:

```python
@pytest.mark.e2e
class TestOffHoursScoring:
    ...

@pytest.mark.e2e
class TestSourceTimestamps:
    ...

@pytest.mark.e2e
class TestAlertSuppression:
    ...

@pytest.mark.e2e
class TestStalenessWindowFallback:
    ...
```

- [ ] **Step 6: Create `services/correlation/conftest.py` to register the marker**

Create `services/correlation/conftest.py`:

```python
import pytest


def pytest_configure(config):
    config.addinivalue_line("markers", "e2e: end-to-end tests requiring Docker")
```

- [ ] **Step 7: Run the E2E tests to verify they pass**

Run:

```bash
cd services/correlation && . .venv/bin/activate && python -m pytest test_e2e_staleness.py -v
```

Expected: all 8 tests pass, container spins up and tears down automatically.

- [ ] **Step 8: Verify unit-only runs still exclude E2E tests**

Run:

```bash
cd services/correlation && . .venv/bin/activate && python -m pytest -v -k "not integration and not e2e"
```

Expected: `test_e2e_staleness.py` is not collected (filename contains `e2e`, which the `-k` filter excludes). Also verify no `PytestUnknownMarkWarning` appears.

- [ ] **Step 9: Verify marker-based filtering works**

Run:

```bash
cd services/correlation && . .venv/bin/activate && python -m pytest -v -m "not e2e" --co
```

Expected: `test_e2e_staleness.py` tests are not collected. This confirms the marker-based filter works in addition to the `-k` filter.

- [ ] **Step 10: Commit**

```bash
git add services/correlation/test_e2e_staleness.py services/correlation/conftest.py
git commit -m "test: use testcontainers for E2E test database isolation (#25)"
```

---

### Task 3: Update Makefile and project docs

**Files:**

- Modify: `Makefile`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update Makefile py-test-all help text**

In `Makefile`, change:

```makefile
py-test-all: ## Run full Python test suite (requires DATABASE_URL)
```

To:

```makefile
py-test-all: ## Run full Python test suite (E2E tests require Docker)
```

- [ ] **Step 2: Update CLAUDE.md Python test commands**

In the "Python (Correlation Service)" section under "Build and Test Commands", change:

```bash
python -m pytest -v                                                # Full suite (requires DATABASE_URL)
```

To:

```bash
python -m pytest -v                                                # Full suite (E2E tests require Docker)
```

- [ ] **Step 3: Verify make help output**

Run:

```bash
make help | grep py-test-all
```

Expected: shows `py-test-all` with updated help text mentioning Docker instead of DATABASE_URL.

- [ ] **Step 4: Commit**

```bash
git add Makefile CLAUDE.md
git commit -m "docs: update test commands -- E2E tests require Docker, not DATABASE_URL"
```
