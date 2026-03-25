#!/usr/bin/env bash
set -Eeuo pipefail

# E2E test for the Correlation Engine epic.
#
# Validates the complete data flow:
#   Raw prices -> Domain indices -> Pairwise correlations -> API response
#
# Starts the full Docker Compose stack (TimescaleDB, correlation service,
# Next.js app), seeds 45 days of raw constituent prices, waits for the
# correlation service to compute indices and correlations, then verifies
# the API endpoint returns correct data.
#
# Usage: ./tests/e2e-correlation.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DC="docker compose -p frm-e2e -f ${PROJECT_DIR}/docker-compose.yml"

cleanup() {
    echo "--- Cleaning up Docker services ---"
    ${DC} down -v --remove-orphans 2>/dev/null || true
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

echo "=== E2E Test: Correlation Engine (Raw Prices -> Indices -> Correlations -> API) ==="
echo ""

# ---------------------------------------------------------------------------
# 1. Start TimescaleDB
# ---------------------------------------------------------------------------
echo "--- Starting TimescaleDB ---"
${DC} up -d timescaledb

echo "--- Waiting for TimescaleDB to be healthy ---"
for i in $(seq 1 60); do
    if ${DC} exec -T timescaledb \
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

# ---------------------------------------------------------------------------
# 2. Seed 45 days of raw constituent prices
#    Constituents:
#      IDX_PRIVATE_CREDIT: OWL, ARCC, BXSL, OBDC
#      IDX_AI_TECH:        NVDA, MSFT, GOOGL, META, AMZN
#      IDX_ENERGY:         CL=F
# ---------------------------------------------------------------------------
echo "--- Seeding 45 days of raw constituent prices ---"

# Generate INSERT statements for 45 days of price data.
# Uses deterministic pseudo-random prices based on ticker+day offsets.
SEED_SQL="INSERT INTO time_series (time, ticker, value, source) VALUES"
SEPARATOR=""

ALL_TICKERS=("OWL" "ARCC" "BXSL" "OBDC" "NVDA" "MSFT" "GOOGL" "META" "AMZN" "CL=F")

# Base prices for each ticker (used to generate realistic-looking data)
declare -A BASE_PRICES
BASE_PRICES[OWL]=13.50
BASE_PRICES[ARCC]=20.10
BASE_PRICES[BXSL]=25.75
BASE_PRICES[OBDC]=14.80
BASE_PRICES[NVDA]=850.00
BASE_PRICES[MSFT]=415.00
BASE_PRICES[GOOGL]=175.00
BASE_PRICES[META]=510.00
BASE_PRICES[AMZN]=185.00
BASE_PRICES["CL=F"]=72.50

for day_offset in $(seq 1 45); do
    for ticker in "${ALL_TICKERS[@]}"; do
        base="${BASE_PRICES[$ticker]}"
        # Add a small daily variation using the day offset
        # This creates price movement that will produce non-trivial correlations
        variation=$(echo "scale=4; $base * (1 + ($day_offset % 7 - 3) * 0.005 + ($day_offset % 11 - 5) * 0.003)" | bc)
        SEED_SQL="${SEED_SQL}${SEPARATOR}
    (NOW() - INTERVAL '${day_offset} days', '${ticker}', ${variation}, 'finnhub')"
        SEPARATOR=","
    done
done

SEED_SQL="${SEED_SQL}
ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source;"

${DC} exec -T timescaledb \
    psql -U risk -d riskmonitor -c "${SEED_SQL}"
echo "PASS: Seeded 450 rows (10 tickers x 45 days)"

# Verify seeded data count
SEED_COUNT=$(${DC} exec -T timescaledb \
    psql -U risk -d riskmonitor -t -c \
    "SELECT COUNT(*) FROM time_series WHERE source = 'finnhub';" 2>/dev/null | tr -d '[:space:]')

if [ "${SEED_COUNT}" -lt 400 ]; then
    echo "FAIL: Expected at least 400 seeded rows, got ${SEED_COUNT}" >&2
    exit 1
fi
echo "PASS: ${SEED_COUNT} raw price rows in database"

# ---------------------------------------------------------------------------
# 3. Start the correlation service and wait for it to compute
# ---------------------------------------------------------------------------
echo "--- Starting correlation service (COMPUTE_INTERVAL_SECONDS=5) ---"

# Override the compute interval so the service runs quickly
COMPUTE_INTERVAL_SECONDS=5 ${DC} up -d correlation

echo "--- Waiting for domain indices to appear in time_series ---"
INDEX_TICKERS=("IDX_PRIVATE_CREDIT" "IDX_AI_TECH" "IDX_ENERGY")
for attempt in $(seq 1 90); do
    IDX_COUNT=$(${DC} exec -T timescaledb \
        psql -U risk -d riskmonitor -t -c \
        "SELECT COUNT(DISTINCT ticker) FROM time_series WHERE ticker IN ('IDX_PRIVATE_CREDIT', 'IDX_AI_TECH', 'IDX_ENERGY');" 2>/dev/null | tr -d '[:space:]')

    if [ "${IDX_COUNT}" = "3" ]; then
        echo "All 3 domain indices found (attempt ${attempt})"
        break
    fi
    if [ "$attempt" -eq 90 ]; then
        echo "FAIL: Timed out waiting for domain indices (found ${IDX_COUNT}/3)" >&2
        # Show correlation service logs for debugging
        ${DC} logs correlation 2>&1 | tail -30
        exit 1
    fi
    sleep 2
done

# ---------------------------------------------------------------------------
# 4. Verify domain indices exist
# ---------------------------------------------------------------------------
echo ""
echo "--- Verifying domain indices ---"
for idx_ticker in "${INDEX_TICKERS[@]}"; do
    COUNT=$(${DC} exec -T timescaledb \
        psql -U risk -d riskmonitor -t -c \
        "SELECT COUNT(*) FROM time_series WHERE ticker = '${idx_ticker}';" 2>/dev/null | tr -d '[:space:]')

    if [ "${COUNT}" -lt 1 ]; then
        echo "FAIL: ${idx_ticker} has no rows in time_series" >&2
        exit 1
    fi
    echo "PASS: ${idx_ticker} has ${COUNT} rows"
done

# ---------------------------------------------------------------------------
# 5. Wait for correlations to appear
# ---------------------------------------------------------------------------
echo ""
echo "--- Waiting for correlation values to appear ---"
CORR_TICKERS=("CORR_CREDIT_TECH" "CORR_CREDIT_ENERGY" "CORR_TECH_ENERGY")
for attempt in $(seq 1 90); do
    CORR_COUNT=$(${DC} exec -T timescaledb \
        psql -U risk -d riskmonitor -t -c \
        "SELECT COUNT(DISTINCT ticker) FROM time_series WHERE ticker IN ('CORR_CREDIT_TECH', 'CORR_CREDIT_ENERGY', 'CORR_TECH_ENERGY');" 2>/dev/null | tr -d '[:space:]')

    if [ "${CORR_COUNT}" = "3" ]; then
        echo "All 3 correlation tickers found (attempt ${attempt})"
        break
    fi
    if [ "$attempt" -eq 90 ]; then
        echo "FAIL: Timed out waiting for correlations (found ${CORR_COUNT}/3)" >&2
        ${DC} logs correlation 2>&1 | tail -30
        exit 1
    fi
    sleep 2
done

# Verify each correlation ticker
for corr_ticker in "${CORR_TICKERS[@]}"; do
    COUNT=$(${DC} exec -T timescaledb \
        psql -U risk -d riskmonitor -t -c \
        "SELECT COUNT(*) FROM time_series WHERE ticker = '${corr_ticker}';" 2>/dev/null | tr -d '[:space:]')

    if [ "${COUNT}" -lt 1 ]; then
        echo "FAIL: ${corr_ticker} has no rows in time_series" >&2
        exit 1
    fi
    echo "PASS: ${corr_ticker} has ${COUNT} rows"
done

# ---------------------------------------------------------------------------
# 6. Verify correlation values are between -1 and 1
# ---------------------------------------------------------------------------
echo ""
echo "--- Verifying correlation values are in [-1, 1] ---"
OUT_OF_RANGE=$(${DC} exec -T timescaledb \
    psql -U risk -d riskmonitor -t -c \
    "SELECT COUNT(*) FROM time_series WHERE ticker LIKE 'CORR_%' AND (value < -1.0 OR value > 1.0);" 2>/dev/null | tr -d '[:space:]')

if [ "${OUT_OF_RANGE}" != "0" ]; then
    echo "FAIL: Found ${OUT_OF_RANGE} correlation values outside [-1, 1]" >&2
    exit 1
fi
echo "PASS: All correlation values are in [-1, 1]"

# ---------------------------------------------------------------------------
# 7. Start app and verify API endpoint
# ---------------------------------------------------------------------------
echo ""
echo "--- Starting app service ---"
${DC} up -d app

echo "--- Waiting for app service to be ready ---"
for i in $(seq 1 90); do
    if curl -sf http://localhost:3000 >/dev/null 2>&1; then
        echo "App service is ready (attempt ${i})"
        break
    fi
    if [ "$i" -eq 90 ]; then
        echo "FAIL: App service did not become ready in 90 seconds" >&2
        ${DC} logs app 2>&1 | tail -30
        exit 1
    fi
    sleep 1
done

echo "--- Querying GET /api/risk/correlations?days=79 ---"
API_RESPONSE=$(curl -sf "http://localhost:3000/api/risk/correlations?days=79")

if [ -z "${API_RESPONSE}" ]; then
    echo "FAIL: API returned empty response" >&2
    exit 1
fi
echo "Response: ${API_RESPONSE}" | head -5

# Assert: all three pairs are present with non-empty arrays
for key in credit_tech credit_energy tech_energy; do
    LEN=$(echo "${API_RESPONSE}" | jq --arg k "${key}" '.[$k] | length')
    if [ "${LEN}" -lt 1 ]; then
        echo "FAIL: ${key} is empty in API response" >&2
        exit 1
    fi
    echo "PASS: ${key} has ${LEN} entries"
done

# Assert: each entry has time and value fields
for key in credit_tech credit_energy tech_energy; do
    HAS_FIELDS=$(echo "${API_RESPONSE}" | jq --arg k "${key}" '.[$k][0] | has("time") and has("value")')
    if [ "${HAS_FIELDS}" != "true" ]; then
        echo "FAIL: ${key} entries missing required fields (time, value)" >&2
        exit 1
    fi
done
echo "PASS: All entries have time and value fields"

# Assert: all API-returned correlation values are between -1 and 1
for key in credit_tech credit_energy tech_energy; do
    BAD_VALUES=$(echo "${API_RESPONSE}" | jq --arg k "${key}" \
        '[.[$k][] | select(.value < -1.0 or .value > 1.0)] | length')
    if [ "${BAD_VALUES}" != "0" ]; then
        echo "FAIL: ${key} has ${BAD_VALUES} values outside [-1, 1]" >&2
        exit 1
    fi
done
echo "PASS: All API correlation values are in [-1, 1]"

# Assert: max_current field exists and has required shape
MAX_PAIR=$(echo "${API_RESPONSE}" | jq -r '.max_current.pair')
MAX_VALUE=$(echo "${API_RESPONSE}" | jq '.max_current.value')
HAS_THRESHOLD=$(echo "${API_RESPONSE}" | jq 'has("max_current") and (.max_current | has("pair") and has("value") and has("above_threshold"))')

if [ "${HAS_THRESHOLD}" != "true" ]; then
    echo "FAIL: max_current missing required fields (pair, value, above_threshold)" >&2
    exit 1
fi
echo "PASS: max_current has correct shape"

# Assert: max_current.pair is one of the known pairs
case "${MAX_PAIR}" in
    credit_tech|credit_energy|tech_energy)
        echo "PASS: max_current.pair is '${MAX_PAIR}'"
        ;;
    *)
        echo "FAIL: max_current.pair '${MAX_PAIR}' is not a valid pair name" >&2
        exit 1
        ;;
esac

# Assert: max_current.value is a number between -1 and 1
IS_VALID_VALUE=$(echo "${MAX_VALUE}" | jq '. >= -1.0 and . <= 1.0')
if [ "${IS_VALID_VALUE}" != "true" ]; then
    echo "FAIL: max_current.value ${MAX_VALUE} is not in [-1, 1]" >&2
    exit 1
fi
echo "PASS: max_current.value is ${MAX_VALUE} (in [-1, 1])"

echo ""
echo "=== All E2E correlation engine tests passed ==="
