#!/usr/bin/env bash
set -Eeuo pipefail

# Integration test for the FRED-to-TimescaleDB-to-Dashboard pipeline.
# Requires Docker and Docker Compose.
#
# Usage: ./tests/integration-test.sh
#
# Spins up TimescaleDB + ingestion service, waits for data,
# queries the API route, and verifies the response shape.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

cleanup() {
    echo "--- Cleaning up Docker services ---"
    docker compose -f "${PROJECT_DIR}/docker-compose.yml" down -v --remove-orphans 2>/dev/null || true
}
trap cleanup EXIT

error_handler() {
    echo "FAIL: Error on line $1" >&2
    exit 1
}
trap 'error_handler $LINENO' ERR

require_cmd() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "FAIL: Required command not found: $1" >&2
        exit 1
    }
}

require_cmd docker
require_cmd curl
require_cmd jq

echo "=== Integration Test: FRED -> TimescaleDB -> API ==="
echo ""

# Start only TimescaleDB (the ingestion service needs FRED API access)
echo "--- Starting TimescaleDB ---"
docker compose -f "${PROJECT_DIR}/docker-compose.yml" up -d timescaledb

echo "--- Waiting for TimescaleDB to be healthy and initialized ---"
for i in $(seq 1 60); do
    if docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
        psql -U risk -d riskmonitor -t -c "SELECT 1 FROM time_series LIMIT 0;" >/dev/null 2>&1; then
        echo "TimescaleDB is ready and time_series table exists (attempt ${i})"
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "FAIL: TimescaleDB did not become ready in 60 seconds" >&2
        exit 1
    fi
    sleep 1
done

# Verify the schema was created
echo "--- Verifying time_series table exists ---"
TABLE_CHECK=$(docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'time_series';" 2>/dev/null | tr -d '[:space:]')

if [ "${TABLE_CHECK}" != "1" ]; then
    echo "FAIL: time_series table not found" >&2
    exit 1
fi
echo "PASS: time_series table exists"

# Verify hypertable was created
echo "--- Verifying hypertable ---"
HYPER_CHECK=$(docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -t -c "SELECT COUNT(*) FROM timescaledb_information.hypertables WHERE hypertable_name = 'time_series';" 2>/dev/null | tr -d '[:space:]')

if [ "${HYPER_CHECK}" != "1" ]; then
    echo "FAIL: time_series is not a hypertable" >&2
    exit 1
fi
echo "PASS: time_series is a hypertable"

# Insert sample data to simulate what the ingestion service would write
echo "--- Inserting sample data ---"
docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -c "
INSERT INTO time_series (time, ticker, value, source) VALUES
    ('2026-01-15 00:00:00+00', 'BAMLH0A0HYM2', 380.5, 'fred'),
    ('2026-01-16 00:00:00+00', 'BAMLH0A0HYM2', 385.0, 'fred'),
    ('2026-01-17 00:00:00+00', 'BAMLH0A0HYM2', 382.2, 'fred')
ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source;
"
echo "PASS: Sample data inserted"

# Verify data can be queried
echo "--- Verifying data query ---"
ROW_COUNT=$(docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -t -c "SELECT COUNT(*) FROM time_series WHERE ticker = 'BAMLH0A0HYM2';" 2>/dev/null | tr -d '[:space:]')

if [ "${ROW_COUNT}" != "3" ]; then
    echo "FAIL: Expected 3 rows, got ${ROW_COUNT}" >&2
    exit 1
fi
echo "PASS: Query returned ${ROW_COUNT} rows"

# Verify upsert works (idempotent writes)
echo "--- Verifying upsert idempotency ---"
docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -c "
INSERT INTO time_series (time, ticker, value, source) VALUES
    ('2026-01-15 00:00:00+00', 'BAMLH0A0HYM2', 381.0, 'fred')
ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source;
"

UPDATED_VALUE=$(docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -t -c "SELECT value FROM time_series WHERE ticker = 'BAMLH0A0HYM2' AND time = '2026-01-15 00:00:00+00';" 2>/dev/null | tr -d '[:space:]')

if [ "${UPDATED_VALUE}" != "381" ]; then
    echo "FAIL: Upsert did not update value (expected 381, got ${UPDATED_VALUE})" >&2
    exit 1
fi

# Verify total count is still 3 (no duplicate)
ROW_COUNT_AFTER=$(docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -t -c "SELECT COUNT(*) FROM time_series WHERE ticker = 'BAMLH0A0HYM2';" 2>/dev/null | tr -d '[:space:]')

if [ "${ROW_COUNT_AFTER}" != "3" ]; then
    echo "FAIL: Upsert created duplicate (expected 3 rows, got ${ROW_COUNT_AFTER})" >&2
    exit 1
fi
echo "PASS: Upsert is idempotent"

# Verify the index exists
echo "--- Verifying index ---"
INDEX_CHECK=$(docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -t -c "SELECT COUNT(*) FROM pg_indexes WHERE indexname = 'idx_time_series_ticker_time';" 2>/dev/null | tr -d '[:space:]')

if [ "${INDEX_CHECK}" != "1" ]; then
    echo "FAIL: idx_time_series_ticker_time index not found" >&2
    exit 1
fi
echo "PASS: Index exists"

# Start the app service for API route testing
echo "--- Starting app service ---"
docker compose -f "${PROJECT_DIR}/docker-compose.yml" up -d app

echo "--- Waiting for app service to be ready ---"
for i in $(seq 1 60); do
    if curl -sf http://localhost:3000 >/dev/null 2>&1; then
        echo "App service is ready (attempt ${i})"
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "FAIL: App service did not become ready in 60 seconds" >&2
        exit 1
    fi
    sleep 1
done

# Query the API route and verify the response shape
echo "--- Verifying /api/risk/timeseries API route ---"
API_RESPONSE=$(curl -sf "http://localhost:3000/api/risk/timeseries?ticker=BAMLH0A0HYM2&days=79")

if [ -z "${API_RESPONSE}" ]; then
    echo "FAIL: API returned empty response" >&2
    exit 1
fi

# Verify it is a non-empty JSON array
ARRAY_LENGTH=$(echo "${API_RESPONSE}" | jq 'length')
if [ "${ARRAY_LENGTH}" -lt 1 ]; then
    echo "FAIL: Expected non-empty array, got length ${ARRAY_LENGTH}" >&2
    exit 1
fi
echo "PASS: API returned ${ARRAY_LENGTH} rows"

# Verify each row has the required fields: time, ticker, value, source
SHAPE_CHECK=$(echo "${API_RESPONSE}" | jq '.[0] | has("time", "ticker", "value", "source")')
if [ "${SHAPE_CHECK}" != "true" ]; then
    echo "FAIL: Response rows missing required fields (time, ticker, value, source)" >&2
    echo "First row: $(echo "${API_RESPONSE}" | jq '.[0]')" >&2
    exit 1
fi
echo "PASS: API response has correct shape {time, ticker, value, source}"

echo ""
echo "=== All integration tests passed ==="
