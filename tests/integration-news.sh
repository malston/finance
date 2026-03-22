#!/usr/bin/env bash
set -Eeuo pipefail

# Integration test for the news_sentiment -> API pipeline.
# Requires Docker and Docker Compose.
#
# Usage: ./tests/integration-news.sh
#
# Spins up TimescaleDB + app, seeds news_sentiment rows,
# queries the API route, and verifies the response.

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

echo "=== Integration Test: news_sentiment -> API ==="
echo ""

# Start TimescaleDB
echo "--- Starting TimescaleDB ---"
docker compose -f "${PROJECT_DIR}/docker-compose.yml" up -d timescaledb

echo "--- Waiting for TimescaleDB to be healthy and initialized ---"
for i in $(seq 1 60); do
    if docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
        psql -U risk -d riskmonitor -t -c "SELECT 1 FROM news_sentiment LIMIT 0;" >/dev/null 2>&1; then
        echo "TimescaleDB is ready and news_sentiment table exists (attempt ${i})"
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "FAIL: TimescaleDB did not become ready in 60 seconds" >&2
        exit 1
    fi
    sleep 1
done

# Verify the news_sentiment table exists
echo "--- Verifying news_sentiment table exists ---"
TABLE_CHECK=$(docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'news_sentiment';" 2>/dev/null | tr -d '[:space:]')

if [ "${TABLE_CHECK}" != "1" ]; then
    echo "FAIL: news_sentiment table not found" >&2
    exit 1
fi
echo "PASS: news_sentiment table exists"

# Seed known rows
echo "--- Seeding news_sentiment data ---"
docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -c "
INSERT INTO news_sentiment (time, domain, headline, sentiment, source_url) VALUES
    (NOW(), 'private_credit', 'Test: BDC spreads widen sharply', -0.7, 'https://example.com/1'),
    (NOW(), 'ai_tech', 'Test: NVDA hits new high on AI demand', 0.8, 'https://example.com/2');
"
echo "PASS: Seeded 2 news_sentiment rows"

# Verify seeded data via direct query
echo "--- Verifying seeded data ---"
ROW_COUNT=$(docker compose -f "${PROJECT_DIR}/docker-compose.yml" exec -T timescaledb \
    psql -U risk -d riskmonitor -t -c "SELECT COUNT(*) FROM news_sentiment WHERE domain = 'private_credit';" 2>/dev/null | tr -d '[:space:]')

if [ "${ROW_COUNT}" != "1" ]; then
    echo "FAIL: Expected 1 private_credit row, got ${ROW_COUNT}" >&2
    exit 1
fi
echo "PASS: Direct query returned ${ROW_COUNT} private_credit row(s)"

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

# Query the news API route
echo "--- Verifying /api/risk/news API route ---"
API_RESPONSE=$(curl -sf "http://localhost:3000/api/risk/news?domain=private_credit&limit=5")

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
echo "PASS: API returned ${ARRAY_LENGTH} row(s)"

# Verify response rows have expected fields: headline, sentiment, domain
SHAPE_CHECK=$(echo "${API_RESPONSE}" | jq '.[0] | has("headline") and has("sentiment") and has("domain")')
if [ "${SHAPE_CHECK}" != "true" ]; then
    echo "FAIL: Response rows missing required fields (headline, sentiment, domain)" >&2
    echo "First row: $(echo "${API_RESPONSE}" | jq '.[0]')" >&2
    exit 1
fi
echo "PASS: API response has correct shape {headline, sentiment, domain}"

# Verify the seeded headline appears in the response
HEADLINE_MATCH=$(echo "${API_RESPONSE}" | jq -r '.[].headline' | grep -c "Test: BDC spreads widen sharply" || true)
if [ "${HEADLINE_MATCH}" -lt 1 ]; then
    echo "FAIL: Seeded headline 'Test: BDC spreads widen sharply' not found in response" >&2
    echo "Headlines returned: $(echo "${API_RESPONSE}" | jq -r '.[].headline')" >&2
    exit 1
fi
echo "PASS: Seeded headline found in API response"

# Verify domain filtering works (ai_tech should not appear in private_credit query)
AI_HEADLINE_MATCH=$(echo "${API_RESPONSE}" | jq -r '.[].headline' | grep -c "Test: NVDA hits new high on AI demand" || true)
if [ "${AI_HEADLINE_MATCH}" -ne 0 ]; then
    echo "FAIL: ai_tech headline appeared in private_credit domain query" >&2
    exit 1
fi
echo "PASS: Domain filtering excludes other domains"

echo ""
echo "=== All news sentiment integration tests passed ==="
