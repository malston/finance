# Integration Test Testcontainers Conversion

**Issue:** [#44](https://github.com/malston/financial-risk-monitor/issues/44)
**Date:** 2026-03-25
**Status:** Design

## Problem

8 Python integration test files (61 tests) skip when `DATABASE_URL` is not set.
Developers must manually start TimescaleDB and configure `DATABASE_URL` to run them.
PR #43 established a testcontainers-python pattern in `test_e2e_staleness.py` that
spins up an ephemeral TimescaleDB container automatically. This spec extends that
pattern to all integration tests.

## Approach

Lift the `timescale_container` fixture from `test_e2e_staleness.py` into the shared
`conftest.py` with `session` scope. Each integration test file replaces its
`DATABASE_URL`-based `db_url` fixture with a dependency on the shared container.

### Session vs Module Scope

The container fixture uses `session` scope (one container for the entire pytest run).
Each file's `db_conn` remains `module`-scoped (one connection per file). Test isolation
is enforced by `autouse` cleanup fixtures that already exist in every file.

Rationale: container startup costs ~3-5s. Session scope avoids 8 startups (~24-40s
saved). The E2E tests already prove the cleanup-based isolation model works.

## Files Changed

### 1. `conftest.py` -- Add shared fixtures

Move these fixtures from `test_e2e_staleness.py` to `conftest.py`, changing scope
from `module` to `session`:

- `timescale_container` (session) -- starts container, applies `init.sql`
- `db_url` (session) -- extracts connection URL with `sslmode=disable`

Also add a pytest marker registration for `integration`:

```python
config.addinivalue_line("markers", "integration: integration tests requiring Docker")
```

The `_apply_init_sql` helper moves to `conftest.py` as well (private to the module).

### 2. `test_e2e_staleness.py` -- Remove duplicated fixtures

Remove: `timescale_container`, `db_url`, `_apply_init_sql`, `_INIT_SQL`.

Keep: `db_conn` (module-scoped, depends on `db_url` from conftest), all other
fixtures and tests unchanged.

### 3-8. Integration test files -- Replace `db_url` fixture

Each of these 6 files removes its local `db_url` fixture (the one that reads
`DATABASE_URL` and calls `pytest.skip`). The shared `db_url` from conftest is
picked up automatically by pytest's fixture resolution.

| File                                         | Local `db_url` removed | Other changes                                   |
| -------------------------------------------- | ---------------------- | ----------------------------------------------- |
| `test_integration.py`                        | Yes                    | None                                            |
| `test_correlator_integration.py`             | Yes                    | None                                            |
| `scoring/test_integration_private_credit.py` | Yes                    | None                                            |
| `scoring/test_integration_composite.py`      | Yes                    | None                                            |
| `scoring/test_integration_contagion.py`      | Yes                    | None                                            |
| `alerting/test_integration_rules_engine.py`  | Yes                    | Remove redundant DDL from `db_conn` (see below) |

Both `alerting/test_integration_rules_engine.py` and `alerting/test_dispatch_wiring.py`
have `CREATE TABLE IF NOT EXISTS` DDL for `alert_state`/`alert_history` in their
`db_conn` fixtures. These are redundant since `init.sql` creates both tables. Remove
the DDL from both files to keep fixtures clean.

### 9. `alerting/test_dispatch_wiring.py` -- Partial DB dependency

This file has 4 tests across 2 classes:

- `TestUpdateDeliveryStatus` (2 tests) -- needs DB
- `TestDispatchAndRecord` (2 tests) -- no DB, uses `responses` mock

Remove the local `db_url` fixture. The `db_conn` fixture (module-scoped) already
depends on `db_url`, which conftest now provides. Remove the redundant DDL from
`db_conn` (covered in the DDL note above).

### 10. `scoring/test_fetch_latest_value.py` -- Restructure `db_conn`

This file defines `db_conn` as a function-scoped fixture _inside each test class_
(3 separate definitions). Each one reads `DATABASE_URL` and calls `pytest.skip`.

Refactor to a single module-level `db_conn` fixture (module-scoped) that depends
on the shared `db_url` from conftest, matching the pattern in all other files.
Remove all 3 class-level `db_conn` fixtures. Keep the `import psycopg2` at module
level since the new module-level `db_conn` calls `psycopg2.connect(db_url)`.

## Marker Strategy

All DB-dependent test classes get `@pytest.mark.integration`. This is required
because two files (`test_fetch_latest_value.py`, `test_dispatch_wiring.py`) don't
have "integration" in their filename, so `-k` filtering alone would miss them.

Apply `@pytest.mark.integration` to:

- All test classes in the 6 "test*integration*\*.py" files
- `TestMaxAgeHoursValidation`, `TestStalenessLogging`, `TestFetchLatestValueIntegration`
  in `test_fetch_latest_value.py`
- `TestUpdateDeliveryStatus` in `test_dispatch_wiring.py`
- Do NOT mark `TestDispatchAndRecord` in `test_dispatch_wiring.py` (no DB dependency)

The `test_e2e_staleness.py` classes keep `@pytest.mark.e2e` (no change).

## What Does NOT Change

- **No new dependencies.** `testcontainers[postgres]` is already in
  `requirements-test.txt` from PR #43.
- **No test logic changes.** All assertions, seed data, and cleanup logic stay
  identical. Only the fixture wiring changes.
- **`test_e2e_staleness.py` E2E tests** keep their `@pytest.mark.e2e` markers.
  The E2E/integration distinction is preserved.

## Fixture Dependency Graph

```
conftest.py::timescale_container (session)
    |
    v
conftest.py::db_url (session)
    |
    +---> each file::db_conn (module) ---> each file::clean_test_data (autouse)
    |
    +---> scoring functions that accept db_url as string argument
```

## Test Execution

After conversion, markers are the authoritative gating mechanism:

```bash
# All tests (unit + integration + E2E) -- requires Docker
python -m pytest -v

# Unit tests only (no Docker needed)
python -m pytest -v -m "not integration and not e2e"

# Integration only
python -m pytest -v -m integration

# E2E only
python -m pytest -v -m e2e
```

## Makefile Update

Update the `py-test` target to use marker-based filtering instead of `-k`:

```makefile
py-test:
	cd services/correlation && . .venv/bin/activate && \
		python -m pytest -v -m "not integration and not e2e"
```

Update the `py-test-all` help text to remove the "integration requires DATABASE_URL"
note, since testcontainers handles this automatically now. Only Docker is required.

## Verification

1. `python -m pytest -v` -- all 293+ tests pass (unit + integration + E2E)
2. `python -m pytest -v -m "not integration and not e2e"` -- only unit tests run,
   no container startup
3. `python -m pytest -v -m integration` -- only integration tests run
4. `python -m pytest -v -m e2e` -- only E2E tests run
5. No `pytest.skip` messages for DATABASE_URL in any test output
