#!/usr/bin/env bash
set -Eeuo pipefail

# Integration test for the correlation API endpoint against real TimescaleDB.
# Requires Docker and Docker Compose.
#
# Usage: ./tests/integration-correlations.sh
#
# Spins up TimescaleDB + app, seeds correlation data via psql,
# curls the /api/risk/correlations endpoint, and verifies the response.

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

echo "=== Integration Test: Correlations API (TimescaleDB -> /api/risk/correlations) ==="
echo ""

# Start TimescaleDB
echo "--- Starting TimescaleDB ---"
docker compose -f "${PROJECT_DIR}/docker-compose.yml" up -d timescaledb

echo "--- Waiting for TimescaleDB to be healthy ---"
for i in $(seq 1 60); do
    if docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
        psql -U risk -d riskmonitor -t -c "SELECT 1 FROM time_series LIMIT 0;" >/dev/null 2>&1; then
        echo "TimescaleDB is ready (attempt ${i})"
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "FAIL: TimescaleDB did not become ready in 60 seconds" >&2
        exit 1
    fi
    sleep 1
done

# Seed known correlation values
echo "--- Seeding correlation data ---"
docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -c "
INSERT INTO time_series (time, ticker, value, source) VALUES
    (NOW() - INTERVAL '1 day', 'CORR_CREDIT_TECH', 0.42, 'computed'),
    (NOW() - INTERVAL '1 day', 'CORR_CREDIT_ENERGY', -0.15, 'computed'),
    (NOW() - INTERVAL '1 day', 'CORR_TECH_ENERGY', 0.68, 'computed')
ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source;
"
echo "PASS: Correlation data seeded"

# Verify the seeded data is queryable
echo "--- Verifying seeded data ---"
CORR_COUNT=$(docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -t -c "SELECT COUNT(*) FROM time_series WHERE ticker LIKE 'CORR_%';" 2>/dev/null | tr -d '[:space:]')

if [ "${CORR_COUNT}" != "3" ]; then
    echo "FAIL: Expected 3 correlation rows, got ${CORR_COUNT}" >&2
    exit 1
fi
echo "PASS: 3 correlation rows in database"

# Start the app service
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

# Query the correlations API
echo "--- Querying GET /api/risk/correlations?days=79 ---"
API_RESPONSE=$(curl -sf "http://localhost:3000/api/risk/correlations?days=79")

if [ -z "${API_RESPONSE}" ]; then
    echo "FAIL: API returned empty response" >&2
    exit 1
fi

echo "Response: ${API_RESPONSE}"

# Assert: credit_tech has 1 entry with the seeded value
CREDIT_TECH_LEN=$(echo "${API_RESPONSE}" | jq '.credit_tech | length')
if [ "${CREDIT_TECH_LEN}" -ne 1 ]; then
    echo "FAIL: Expected credit_tech to have 1 entry, got ${CREDIT_TECH_LEN}" >&2
    exit 1
fi
echo "PASS: credit_tech has ${CREDIT_TECH_LEN} entry"

CREDIT_TECH_VALUE=$(echo "${API_RESPONSE}" | jq '.credit_tech[0].value')
if [ "$(echo "${CREDIT_TECH_VALUE}" | jq '. == 0.42')" != "true" ]; then
    echo "FAIL: Expected credit_tech value 0.42, got ${CREDIT_TECH_VALUE}" >&2
    exit 1
fi
echo "PASS: credit_tech value is 0.42"

# Assert: credit_energy has 1 entry
CREDIT_ENERGY_LEN=$(echo "${API_RESPONSE}" | jq '.credit_energy | length')
if [ "${CREDIT_ENERGY_LEN}" -ne 1 ]; then
    echo "FAIL: Expected credit_energy to have 1 entry, got ${CREDIT_ENERGY_LEN}" >&2
    exit 1
fi
echo "PASS: credit_energy has ${CREDIT_ENERGY_LEN} entry"

# Assert: tech_energy has 1 entry
TECH_ENERGY_LEN=$(echo "${API_RESPONSE}" | jq '.tech_energy | length')
if [ "${TECH_ENERGY_LEN}" -ne 1 ]; then
    echo "FAIL: Expected tech_energy to have 1 entry, got ${TECH_ENERGY_LEN}" >&2
    exit 1
fi
echo "PASS: tech_energy has ${TECH_ENERGY_LEN} entry"

# Assert: All three pairs present (3 total data series)
TOTAL_PAIRS=0
for key in credit_tech credit_energy tech_energy; do
    LEN=$(echo "${API_RESPONSE}" | jq --arg k "${key}" '.[$k] | length')
    if [ "${LEN}" -ge 1 ]; then
        TOTAL_PAIRS=$((TOTAL_PAIRS + 1))
    fi
done
if [ "${TOTAL_PAIRS}" -ne 3 ]; then
    echo "FAIL: Expected 3 correlation pairs with data, got ${TOTAL_PAIRS}" >&2
    exit 1
fi
echo "PASS: All 3 correlation pairs have data"

# Assert: Each entry has time and value fields
for key in credit_tech credit_energy tech_energy; do
    HAS_FIELDS=$(echo "${API_RESPONSE}" | jq --arg k "${key}" '.[$k][0] | has("time") and has("value")')
    if [ "${HAS_FIELDS}" != "true" ]; then
        echo "FAIL: ${key} entries missing required fields (time, value)" >&2
        exit 1
    fi
done
echo "PASS: All entries have time and value fields"

# Assert: max_current.value matches the max absolute value (0.68 from CORR_TECH_ENERGY)
MAX_VALUE=$(echo "${API_RESPONSE}" | jq '.max_current.value')
if [ "$(echo "${MAX_VALUE}" | jq '. == 0.68')" != "true" ]; then
    echo "FAIL: Expected max_current.value to be 0.68, got ${MAX_VALUE}" >&2
    exit 1
fi
echo "PASS: max_current.value is 0.68"

# Assert: max_current.pair is tech_energy
MAX_PAIR=$(echo "${API_RESPONSE}" | jq -r '.max_current.pair')
if [ "${MAX_PAIR}" != "tech_energy" ]; then
    echo "FAIL: Expected max_current.pair to be tech_energy, got ${MAX_PAIR}" >&2
    exit 1
fi
echo "PASS: max_current.pair is tech_energy"

# Assert: max_current.above_threshold is true (0.68 > 0.5)
ABOVE_THRESHOLD=$(echo "${API_RESPONSE}" | jq '.max_current.above_threshold')
if [ "${ABOVE_THRESHOLD}" != "true" ]; then
    echo "FAIL: Expected max_current.above_threshold to be true, got ${ABOVE_THRESHOLD}" >&2
    exit 1
fi
echo "PASS: max_current.above_threshold is true (0.68 >= 0.5)"

echo ""
echo "=== All correlation integration tests passed ==="
