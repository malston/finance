#!/usr/bin/env bash
set -Eeuo pipefail

# E2E test for the complete Risk Dashboard.
#
# Validates the full user experience:
#   1. Starts docker-compose stack (TimescaleDB + app)
#   2. Seeds representative data for all dashboard components
#   3. Verifies all API endpoints return correct data
#   4. Smoke-tests dashboard HTML for key elements
#
# Usage: ./tests/e2e-dashboard.sh

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

PASS_COUNT=0
pass() {
    PASS_COUNT=$((PASS_COUNT + 1))
    echo "PASS: $1"
}

assert_eq() {
    local label="$1" expected="$2" actual="$3"
    if [ "${expected}" != "${actual}" ]; then
        echo "FAIL: ${label} -- expected '${expected}', got '${actual}'" >&2
        exit 1
    fi
    pass "${label}"
}

assert_gte() {
    local label="$1" minimum="$2" actual="$3"
    if [ "${actual}" -lt "${minimum}" ]; then
        echo "FAIL: ${label} -- expected >= ${minimum}, got ${actual}" >&2
        exit 1
    fi
    pass "${label}"
}

assert_contains() {
    local label="$1" needle="$2" haystack="$3"
    if ! echo "${haystack}" | grep -qF "${needle}"; then
        echo "FAIL: ${label} -- response does not contain '${needle}'" >&2
        exit 1
    fi
    pass "${label}"
}

psql_exec() {
    ${DC} exec -T timescaledb \
        psql -U risk -d riskmonitor -t -c "$1" 2>/dev/null
}

psql_exec_raw() {
    ${DC} exec -T timescaledb \
        psql -U risk -d riskmonitor -c "$1" 2>/dev/null
}

echo "=== E2E Test: Complete Risk Dashboard ==="
echo ""

# ---------------------------------------------------------------------------
# 1. Start TimescaleDB
# ---------------------------------------------------------------------------
echo "--- Starting TimescaleDB ---"
${DC} up -d timescaledb

echo "--- Waiting for TimescaleDB to be healthy ---"
for i in $(seq 1 60); do
    if psql_exec "SELECT 1;" >/dev/null 2>&1; then
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
# 2. Seed representative data
# ---------------------------------------------------------------------------
echo ""
echo "--- Seeding time_series: composite and domain scores ---"

SEED_SQL="INSERT INTO time_series (time, ticker, value, source) VALUES"
SEPARATOR=""

# Composite and domain scores (7 days of history)
SCORE_TICKERS=("SCORE_COMPOSITE" "SCORE_PRIVATE_CREDIT" "SCORE_AI_CONCENTRATION" "SCORE_ENERGY_GEO" "SCORE_CONTAGION")
declare -A SCORE_VALUES
SCORE_VALUES[SCORE_COMPOSITE]=62
SCORE_VALUES[SCORE_PRIVATE_CREDIT]=55
SCORE_VALUES[SCORE_AI_CONCENTRATION]=70
SCORE_VALUES[SCORE_ENERGY_GEO]=48
SCORE_VALUES[SCORE_CONTAGION]=75

for day_offset in $(seq 0 6); do
    for ticker in "${SCORE_TICKERS[@]}"; do
        base="${SCORE_VALUES[$ticker]}"
        variation=$(echo "scale=2; $base + ($day_offset % 5 - 2) * 1.5" | bc)
        SEED_SQL="${SEED_SQL}${SEPARATOR}
    (NOW() - INTERVAL '${day_offset} days', '${ticker}', ${variation}, 'scoring')"
        SEPARATOR=","
    done
done

echo "--- Seeding time_series: correlation pairs ---"

# Correlation pairs (7 days of history)
CORR_TICKERS=("CORR_CREDIT_TECH" "CORR_CREDIT_ENERGY" "CORR_TECH_ENERGY")
declare -A CORR_VALUES
CORR_VALUES[CORR_CREDIT_TECH]=0.42
CORR_VALUES[CORR_CREDIT_ENERGY]=0.31
CORR_VALUES[CORR_TECH_ENERGY]=0.58

for day_offset in $(seq 0 6); do
    for ticker in "${CORR_TICKERS[@]}"; do
        base="${CORR_VALUES[$ticker]}"
        variation=$(echo "scale=4; $base + ($day_offset % 3 - 1) * 0.02" | bc)
        SEED_SQL="${SEED_SQL}${SEPARATOR}
    (NOW() - INTERVAL '${day_offset} days', '${ticker}', ${variation}, 'correlation')"
        SEPARATOR=","
    done
done

echo "--- Seeding time_series: raw ticker prices (4 domains) ---"

# Private Credit domain
PC_TICKERS=("OWL" "ARCC" "BXSL" "OBDC")
declare -A PC_PRICES
PC_PRICES[OWL]=13.50
PC_PRICES[ARCC]=20.10
PC_PRICES[BXSL]=25.75
PC_PRICES[OBDC]=14.80

# AI/Tech domain
AI_TICKERS=("NVDA" "MSFT" "GOOGL" "META" "AMZN")
declare -A AI_PRICES
AI_PRICES[NVDA]=850.00
AI_PRICES[MSFT]=415.00
AI_PRICES[GOOGL]=175.00
AI_PRICES[META]=510.00
AI_PRICES[AMZN]=185.00

# Energy domain
EN_TICKERS=("CL=F")
declare -A EN_PRICES
EN_PRICES["CL=F"]=72.50

# Cross-domain / contagion indicators
CD_TICKERS=("SPY" "RSP")
declare -A CD_PRICES
CD_PRICES[SPY]=525.00
CD_PRICES[RSP]=165.00

for day_offset in $(seq 0 14); do
    for ticker in "${PC_TICKERS[@]}"; do
        base="${PC_PRICES[$ticker]}"
        val=$(echo "scale=4; $base * (1 + ($day_offset % 7 - 3) * 0.005)" | bc)
        SEED_SQL="${SEED_SQL}${SEPARATOR}
    (NOW() - INTERVAL '${day_offset} days', '${ticker}', ${val}, 'finnhub')"
        SEPARATOR=","
    done
    for ticker in "${AI_TICKERS[@]}"; do
        base="${AI_PRICES[$ticker]}"
        val=$(echo "scale=4; $base * (1 + ($day_offset % 7 - 3) * 0.005)" | bc)
        SEED_SQL="${SEED_SQL}${SEPARATOR}
    (NOW() - INTERVAL '${day_offset} days', '${ticker}', ${val}, 'finnhub')"
        SEPARATOR=","
    done
    for ticker in "${EN_TICKERS[@]}"; do
        base="${EN_PRICES[$ticker]}"
        val=$(echo "scale=4; $base * (1 + ($day_offset % 7 - 3) * 0.005)" | bc)
        SEED_SQL="${SEED_SQL}${SEPARATOR}
    (NOW() - INTERVAL '${day_offset} days', '${ticker}', ${val}, 'finnhub')"
        SEPARATOR=","
    done
    for ticker in "${CD_TICKERS[@]}"; do
        base="${CD_PRICES[$ticker]}"
        val=$(echo "scale=4; $base * (1 + ($day_offset % 7 - 3) * 0.005)" | bc)
        SEED_SQL="${SEED_SQL}${SEPARATOR}
    (NOW() - INTERVAL '${day_offset} days', '${ticker}', ${val}, 'finnhub')"
        SEPARATOR=","
    done
done

SEED_SQL="${SEED_SQL}
ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source;"

psql_exec_raw "${SEED_SQL}"

TOTAL_ROWS=$(psql_exec "SELECT COUNT(*) FROM time_series;" | tr -d '[:space:]')
assert_gte "Seeded time_series rows" 100 "${TOTAL_ROWS}"

echo ""
echo "--- Seeding source_health ---"
psql_exec_raw "
INSERT INTO source_health (source, last_success, consecutive_failures)
VALUES
    ('fred', NOW() - INTERVAL '30 minutes', 0),
    ('finnhub', NOW() - INTERVAL '2 minutes', 0)
ON CONFLICT (source) DO UPDATE SET
    last_success = EXCLUDED.last_success,
    consecutive_failures = EXCLUDED.consecutive_failures;
"
pass "Seeded source_health (fred, finnhub)"

echo ""
echo "--- Seeding news_sentiment ---"
psql_exec_raw "
INSERT INTO news_sentiment (time, domain, headline, sentiment, source_name)
VALUES
    (NOW() - INTERVAL '1 hour', 'private_credit', 'BDC sector sees record inflows amid rate stability', 0.72, 'Reuters'),
    (NOW() - INTERVAL '2 hours', 'ai_concentration', 'Chipmaker earnings beat expectations on data center demand', 0.85, 'Bloomberg'),
    (NOW() - INTERVAL '3 hours', 'energy_geo', 'OPEC signals production cuts amid geopolitical tensions', -0.45, 'FT'),
    (NOW() - INTERVAL '4 hours', 'contagion', 'Cross-market correlations rise as volatility spikes', -0.62, 'WSJ');
"
NEWS_COUNT=$(psql_exec "SELECT COUNT(*) FROM news_sentiment;" | tr -d '[:space:]')
assert_gte "Seeded news_sentiment rows" 4 "${NEWS_COUNT}"

# ---------------------------------------------------------------------------
# 3. Start the app service
# ---------------------------------------------------------------------------
echo ""
echo "--- Starting app service ---"
${DC} up -d app

echo "--- Waiting for app service to be ready ---"
for i in $(seq 1 120); do
    if curl -sf http://localhost:3000 >/dev/null 2>&1; then
        echo "App service is ready (attempt ${i})"
        break
    fi
    if [ "$i" -eq 120 ]; then
        echo "FAIL: App service did not become ready in 120 seconds" >&2
        ${DC} logs app 2>&1 | tail -40
        exit 1
    fi
    sleep 1
done

# ---------------------------------------------------------------------------
# 4. Verify: GET / returns 200 with "BOOKSTABER RISK MONITOR"
# ---------------------------------------------------------------------------
echo ""
echo "--- Verifying dashboard page ---"

DASHBOARD_HTML=$(curl -sf http://localhost:3000)
assert_contains "Dashboard returns HTML with title" "BOOKSTABER RISK MONITOR" "${DASHBOARD_HTML}"

# ---------------------------------------------------------------------------
# 5. Verify: GET /api/risk/scores
# ---------------------------------------------------------------------------
echo ""
echo "--- Verifying GET /api/risk/scores ---"

SCORES_RESPONSE=$(curl -sf http://localhost:3000/api/risk/scores)
if [ -z "${SCORES_RESPONSE}" ]; then
    echo "FAIL: /api/risk/scores returned empty response" >&2
    exit 1
fi

# Composite score must be present and numeric
COMPOSITE_SCORE=$(echo "${SCORES_RESPONSE}" | jq '.composite.score')
if [ "${COMPOSITE_SCORE}" = "null" ] || [ -z "${COMPOSITE_SCORE}" ]; then
    echo "FAIL: composite.score is null or missing" >&2
    echo "Response: ${SCORES_RESPONSE}" | head -5
    exit 1
fi
pass "Composite score present: ${COMPOSITE_SCORE}"

# 4 domain scores
for domain in private_credit ai_concentration energy_geo contagion; do
    DOMAIN_SCORE=$(echo "${SCORES_RESPONSE}" | jq --arg d "${domain}" '.domains[$d].score')
    if [ "${DOMAIN_SCORE}" = "null" ] || [ -z "${DOMAIN_SCORE}" ]; then
        echo "FAIL: ${domain} score is null or missing" >&2
        exit 1
    fi
    pass "${domain} score present: ${DOMAIN_SCORE}"
done

# ---------------------------------------------------------------------------
# 6. Verify: GET /api/risk/correlations
# ---------------------------------------------------------------------------
echo ""
echo "--- Verifying GET /api/risk/correlations ---"

CORR_RESPONSE=$(curl -sf "http://localhost:3000/api/risk/correlations?days=30")
if [ -z "${CORR_RESPONSE}" ]; then
    echo "FAIL: /api/risk/correlations returned empty response" >&2
    exit 1
fi

for pair in credit_tech credit_energy tech_energy; do
    LEN=$(echo "${CORR_RESPONSE}" | jq --arg k "${pair}" '.[$k] | length')
    assert_gte "${pair} has entries" 1 "${LEN}"
done
pass "All 3 correlation pairs present"

# ---------------------------------------------------------------------------
# 7. Verify: GET /api/risk/health
# ---------------------------------------------------------------------------
echo ""
echo "--- Verifying GET /api/risk/health ---"

HEALTH_RESPONSE=$(curl -sf http://localhost:3000/api/risk/health)
if [ -z "${HEALTH_RESPONSE}" ]; then
    echo "FAIL: /api/risk/health returned empty response" >&2
    exit 1
fi

HEALTH_COUNT=$(echo "${HEALTH_RESPONSE}" | jq '.sources | length')
assert_gte "Source health entries" 2 "${HEALTH_COUNT}"

for src in fred finnhub; do
    HAS_SOURCE=$(echo "${HEALTH_RESPONSE}" | jq --arg s "${src}" '[.sources[] | select(.source == $s)] | length')
    assert_gte "source_health contains ${src}" 1 "${HAS_SOURCE}"
done

# ---------------------------------------------------------------------------
# 8. Verify: GET /api/risk/news
# ---------------------------------------------------------------------------
echo ""
echo "--- Verifying GET /api/risk/news ---"

for domain in private_credit ai_concentration energy_geo contagion; do
    NEWS_RESPONSE=$(curl -sf "http://localhost:3000/api/risk/news?domain=${domain}")
    if [ -z "${NEWS_RESPONSE}" ]; then
        echo "FAIL: /api/risk/news?domain=${domain} returned empty response" >&2
        exit 1
    fi
    NEWS_LEN=$(echo "${NEWS_RESPONSE}" | jq '.items | length')
    assert_gte "News for ${domain}" 1 "${NEWS_LEN}"

    HAS_FIELDS=$(echo "${NEWS_RESPONSE}" | jq '.items[0] | has("headline") and has("sentiment")')
    assert_eq "News entry for ${domain} has required fields" "true" "${HAS_FIELDS}"

    HAS_FRAMEWORK=$(echo "${NEWS_RESPONSE}" | jq 'has("framework")')
    assert_eq "News response for ${domain} has framework field" "true" "${HAS_FRAMEWORK}"
done

# ---------------------------------------------------------------------------
# 9. Verify: GET /api/risk/freshness
# ---------------------------------------------------------------------------
echo ""
echo "--- Verifying GET /api/risk/freshness ---"

FRESH_RESPONSE=$(curl -sf http://localhost:3000/api/risk/freshness)
if [ -z "${FRESH_RESPONSE}" ]; then
    echo "FAIL: /api/risk/freshness returned empty response" >&2
    exit 1
fi

TICKER_COUNT=$(echo "${FRESH_RESPONSE}" | jq '.tickers | keys | length')
assert_gte "Freshness ticker count" 5 "${TICKER_COUNT}"

# Spot-check a known ticker
OWL_STATUS=$(echo "${FRESH_RESPONSE}" | jq -r '.tickers.OWL.status')
if [ "${OWL_STATUS}" = "null" ] || [ -z "${OWL_STATUS}" ]; then
    echo "FAIL: OWL ticker missing from freshness response" >&2
    exit 1
fi
pass "OWL freshness status: ${OWL_STATUS}"

# ---------------------------------------------------------------------------
# 10. Verify: GET /api/risk/alerts
# ---------------------------------------------------------------------------
echo ""
echo "--- Verifying GET /api/risk/alerts ---"

ALERTS_RESPONSE=$(curl -sf http://localhost:3000/api/risk/alerts)
if [ -z "${ALERTS_RESPONSE}" ]; then
    echo "FAIL: /api/risk/alerts returned empty response" >&2
    exit 1
fi

HAS_ALERTS_KEY=$(echo "${ALERTS_RESPONSE}" | jq 'has("alerts")')
assert_eq "Alerts response has alerts key" "true" "${HAS_ALERTS_KEY}"

ALERTS_LEN=$(echo "${ALERTS_RESPONSE}" | jq '.alerts | length')
pass "Alerts array length: ${ALERTS_LEN} (empty is valid)"

# ---------------------------------------------------------------------------
# 11. Smoke test: dashboard HTML structural elements
# ---------------------------------------------------------------------------
echo ""
echo "--- Smoke testing dashboard HTML structure ---"

FULL_HTML=$(curl -sf http://localhost:3000)

# Dark theme background color
assert_contains "Dark theme background" "0a0e17" "${FULL_HTML}"

# Key structural data-testid attributes
for testid in dashboard-root header-date header-time; do
    assert_contains "HTML contains data-testid=${testid}" "data-testid=\"${testid}\"" "${FULL_HTML}"
done

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "=== All E2E dashboard tests passed (${PASS_COUNT} assertions) ==="
