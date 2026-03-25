#!/usr/bin/env bash
set -Eeuo pipefail

# E2E test for the alerting pipeline: scores exceed thresholds, rules fire,
# alerts are dispatched to configured channels, cooldown prevents duplicates,
# and the REST API serves and acknowledges alerts.
#
# Requires Docker and Docker Compose.
#
# Usage: ./tests/e2e-alerting.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
DC="docker compose -p frm-e2e -f ${PROJECT_DIR}/docker-compose.yml"

DB_USER="risk"
DB_NAME="riskmonitor"
DB_PASSWORD="${TIMESCALEDB_PASSWORD:-riskmonitor}"
WEBHOOK_PORT=9876
WEBHOOK_PID=""
WEBHOOK_LOG=$(mktemp /tmp/e2e-webhook-payloads.XXXXXX.log)
ALERT_CONFIG=$(mktemp /tmp/e2e-alert-config.XXXXXX.yaml)

cleanup() {
    echo "--- Cleaning up ---"
    if [ -n "${WEBHOOK_PID}" ] && kill -0 "${WEBHOOK_PID}" 2>/dev/null; then
        kill "${WEBHOOK_PID}" 2>/dev/null || true
    fi
    ${DC} down -v --remove-orphans 2>/dev/null || true
    rm -f "${WEBHOOK_LOG}" "${ALERT_CONFIG}"
    if [ -n "${E2E_VENV:-}" ] && [ -d "${E2E_VENV:-}" ]; then
        rm -rf "${E2E_VENV}"
    fi
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
require_cmd python3

psql_cmd() {
    ${DC} exec -T timescaledb \
        psql -U "${DB_USER}" -d "${DB_NAME}" "$@"
}

psql_value() {
    psql_cmd -t -c "$1" 2>/dev/null | tr -d '[:space:]'
}

PASS_COUNT=0
FAIL_COUNT=0

assert_eq() {
    local label="$1" expected="$2" actual="$3"
    if [ "${expected}" = "${actual}" ]; then
        echo "PASS: ${label}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "FAIL: ${label} (expected '${expected}', got '${actual}')" >&2
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

assert_ge() {
    local label="$1" expected="$2" actual="$3"
    if [ "${actual}" -ge "${expected}" ] 2>/dev/null; then
        echo "PASS: ${label}"
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        echo "FAIL: ${label} (expected >= ${expected}, got '${actual}')" >&2
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
}

echo "=== E2E Test: Alerting Pipeline ==="
echo ""

# -------------------------------------------------------------------
# 1. Start a local webhook receiver to capture Slack dispatch payloads
# -------------------------------------------------------------------
echo "--- Starting local webhook receiver on port ${WEBHOOK_PORT} ---"
rm -f ${WEBHOOK_LOG}

python3 -c "
import http.server, json, sys, os

class Handler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(length).decode()
        with open('${WEBHOOK_LOG}', 'a') as f:
            f.write(body + '\n')
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')
    def log_message(self, fmt, *args):
        pass  # suppress access logs

server = http.server.HTTPServer(('0.0.0.0', ${WEBHOOK_PORT}), Handler)
server.serve_forever()
" &
WEBHOOK_PID=$!
sleep 1

if ! kill -0 "${WEBHOOK_PID}" 2>/dev/null; then
    echo "FAIL: Webhook receiver did not start" >&2
    exit 1
fi
echo "PASS: Webhook receiver running (PID ${WEBHOOK_PID})"

# The Python evaluate_rules runs locally (not in Docker), so use localhost.
WEBHOOK_URL="http://localhost:${WEBHOOK_PORT}/webhook"
echo "Webhook URL: ${WEBHOOK_URL}"

# -------------------------------------------------------------------
# 2. Start TimescaleDB
# -------------------------------------------------------------------
echo ""
echo "--- Starting TimescaleDB ---"
${DC} up -d timescaledb

echo "--- Waiting for TimescaleDB to be healthy ---"
for i in $(seq 1 60); do
    if psql_cmd -c "SELECT 1" >/dev/null 2>&1; then
        echo "TimescaleDB ready (attempt ${i})"
        break
    fi
    if [ "$i" -eq 60 ]; then
        echo "FAIL: TimescaleDB did not become ready" >&2
        exit 1
    fi
    sleep 1
done

# Ensure alert tables exist (init.sql should create them, but confirm)
echo "--- Verifying alert tables ---"
ALERT_HISTORY_EXISTS=$(psql_value "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'alert_history';")
assert_eq "alert_history table exists" "1" "${ALERT_HISTORY_EXISTS}"

ALERT_STATE_EXISTS=$(psql_value "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'alert_state';")
assert_eq "alert_state table exists" "1" "${ALERT_STATE_EXISTS}"

# -------------------------------------------------------------------
# 3. Seed SCORE_COMPOSITE readings above 75 (3 consecutive)
# -------------------------------------------------------------------
echo ""
echo "--- Seeding SCORE_COMPOSITE readings (3 consecutive > 75) ---"
psql_cmd -c "
INSERT INTO time_series (time, ticker, value, source) VALUES
    (NOW() - INTERVAL '10 minutes', 'SCORE_COMPOSITE', 78.5, 'e2e-test'),
    (NOW() - INTERVAL '5 minutes',  'SCORE_COMPOSITE', 82.1, 'e2e-test'),
    (NOW(),                          'SCORE_COMPOSITE', 80.0, 'e2e-test')
ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source;
" >/dev/null

COMPOSITE_COUNT=$(psql_value "SELECT COUNT(*) FROM time_series WHERE ticker = 'SCORE_COMPOSITE' AND value > 75;")
assert_eq "3 SCORE_COMPOSITE readings > 75 seeded" "3" "${COMPOSITE_COUNT}"

# -------------------------------------------------------------------
# 4. Seed VIX reading above 30
# -------------------------------------------------------------------
echo ""
echo "--- Seeding VIX reading (> 30) ---"
psql_cmd -c "
INSERT INTO time_series (time, ticker, value, source) VALUES
    (NOW(), 'VIX', 35.2, 'e2e-test')
ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source;
" >/dev/null

VIX_VALUE=$(psql_value "SELECT value FROM time_series WHERE ticker = 'VIX' ORDER BY time DESC LIMIT 1;")
assert_eq "VIX seeded at 35.2" "35.2" "${VIX_VALUE}"

# -------------------------------------------------------------------
# 5. Write a test alert config pointing Slack to local webhook receiver
# -------------------------------------------------------------------
echo ""
echo "--- Writing test alert config ---"
cat > ${ALERT_CONFIG} <<YAML
channels:
  email:
    enabled: false
    recipients: []
    from_address: "noreply@example.com"
    api_key: ""
  slack:
    enabled: true
    webhook_url: "${WEBHOOK_URL}"
  browser_push:
    enabled: false

alerts:
  rules:
    - id: composite_critical
      name: "Composite threat CRITICAL"
      condition: "composite_score > 75"
      ticker: SCORE_COMPOSITE
      threshold: 75
      operator: ">"
      consecutive_readings: 3
      cooldown: 4h
      channels: [slack]

    - id: vix_spike
      name: "VIX above 30"
      condition: "vix > 30"
      ticker: VIX
      threshold: 30
      operator: ">"
      consecutive_readings: 1
      cooldown: 4h
      channels: [slack]
YAML

# -------------------------------------------------------------------
# 6. Trigger alert evaluation via Python rules engine directly
# -------------------------------------------------------------------
echo ""
echo "--- Running alert evaluation (iteration 1) ---"

# We need to run the rules engine with 3 separate evaluations to build
# up the consecutive count for composite_critical (it needs 3 readings).
# The engine reads the LATEST value per ticker, so we evaluate 3 times
# while the latest SCORE_COMPOSITE is > 75.

DB_URL="postgres://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
CORRELATION_DIR="${PROJECT_DIR}/services/correlation"

# Reuse the correlation service venv if available (has all needed packages).
# Fall back to a disposable temp venv otherwise.
CORR_VENV="${CORRELATION_DIR}/.venv"
if [ -f "${CORR_VENV}/bin/activate" ]; then
    echo "  Using existing venv at ${CORR_VENV}"
    source "${CORR_VENV}/bin/activate"
else
    echo "  Creating temporary venv (correlation .venv not found)"
    E2E_VENV=$(mktemp -d /tmp/e2e-alerting-venv.XXXXXX)
    python3 -m venv "${E2E_VENV}"
    source "${E2E_VENV}/bin/activate"
    pip install -q psycopg2-binary pyyaml requests 2>/dev/null
fi

# Run evaluate_rules 3 times to build consecutive count for composite_critical.
# Insert a new SCORE_COMPOSITE reading before each iteration so the value changes
# (the rules engine only increments consecutive_count when the value differs).
# The vix_spike rule only needs 1 consecutive reading, so it fires on the first call.
COMPOSITE_VALUES=(78.5 82.1 80.0)
for iter in 1 2 3; do
    COMP_VAL="${COMPOSITE_VALUES[$((iter-1))]}"
    psql_cmd -c "INSERT INTO time_series (time, ticker, value, source) VALUES (NOW(), 'SCORE_COMPOSITE', ${COMP_VAL}, 'e2e-test') ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value;" >/dev/null
    sleep 1
    echo "  Evaluation iteration ${iter} (SCORE_COMPOSITE=${COMP_VAL})..."
    python3 -c "
import sys
sys.path.insert(0, '${CORRELATION_DIR}')
from alerting.rules_engine import evaluate_rules, load_alert_config
from alerting.dispatch import dispatch_alert

config = load_alert_config('${ALERT_CONFIG}')
db_url = '${DB_URL}'
fired = evaluate_rules(db_url, config)
if fired:
    channels_config = config['channels']
    for alert in fired:
        results = dispatch_alert(alert, channels_config)
        print(f'  Fired: {alert[\"rule_id\"]} -> dispatch: {results}')
else:
    print('  No alerts fired')
"
done

# -------------------------------------------------------------------
# 7. Verify alert_history has entries for fired rules
# -------------------------------------------------------------------
echo ""
echo "--- Verifying alert_history entries ---"

COMPOSITE_ALERTS=$(psql_value "SELECT COUNT(*) FROM alert_history WHERE rule_id = 'composite_critical';")
assert_eq "composite_critical alert in history" "1" "${COMPOSITE_ALERTS}"

VIX_ALERTS=$(psql_value "SELECT COUNT(*) FROM alert_history WHERE rule_id = 'vix_spike';")
assert_eq "vix_spike alert in history" "1" "${VIX_ALERTS}"

# Verify alert_history fields are correct
COMPOSITE_VALUE=$(psql_value "SELECT value FROM alert_history WHERE rule_id = 'composite_critical' ORDER BY triggered_at DESC LIMIT 1;")
assert_eq "composite_critical value is 80" "80" "${COMPOSITE_VALUE}"

VIX_ALERT_VALUE=$(psql_value "SELECT value FROM alert_history WHERE rule_id = 'vix_spike' ORDER BY triggered_at DESC LIMIT 1;")
assert_eq "vix_spike value is 35.2" "35.2" "${VIX_ALERT_VALUE}"

# Verify rule_id and message fields exist and are non-empty
COMPOSITE_MSG_LEN=$(psql_value "SELECT LENGTH(message) FROM alert_history WHERE rule_id = 'composite_critical' LIMIT 1;")
assert_ge "composite_critical has non-empty message" "10" "${COMPOSITE_MSG_LEN}"

# -------------------------------------------------------------------
# 8. Verify Slack webhook received the alert payloads
# -------------------------------------------------------------------
echo ""
echo "--- Verifying Slack webhook received payloads ---"
sleep 1  # ensure webhook server had time to flush

if [ -f ${WEBHOOK_LOG} ]; then
    WEBHOOK_LINE_COUNT=$(wc -l < ${WEBHOOK_LOG} | tr -d '[:space:]')
    assert_ge "webhook received at least 2 payloads" "2" "${WEBHOOK_LINE_COUNT}"

    # Verify payload structure (Block Kit attachments)
    FIRST_PAYLOAD=$(head -1 ${WEBHOOK_LOG})
    HAS_ATTACHMENTS=$(echo "${FIRST_PAYLOAD}" | jq 'has("attachments")')
    assert_eq "webhook payload has attachments" "true" "${HAS_ATTACHMENTS}"

    HAS_RULE_FIELD=$(echo "${FIRST_PAYLOAD}" | jq '.attachments[0].fields[0].title')
    assert_eq "webhook payload has Rule field" '"Rule"' "${HAS_RULE_FIELD}"
else
    echo "FAIL: No webhook payloads received" >&2
    FAIL_COUNT=$((FAIL_COUNT + 1))
fi

# -------------------------------------------------------------------
# 9. Cooldown test: re-evaluate -- no duplicate alerts
# -------------------------------------------------------------------
echo ""
echo "--- Testing cooldown (no duplicate alerts within cooldown window) ---"

HISTORY_BEFORE=$(psql_value "SELECT COUNT(*) FROM alert_history;")

python3 -c "
import sys
sys.path.insert(0, '${CORRELATION_DIR}')
from alerting.rules_engine import evaluate_rules, load_alert_config

config = load_alert_config('${ALERT_CONFIG}')
fired = evaluate_rules('${DB_URL}', config)
print(f'  Fired {len(fired)} alert(s) during cooldown')
"

HISTORY_AFTER=$(psql_value "SELECT COUNT(*) FROM alert_history;")
assert_eq "no duplicate alerts during cooldown" "${HISTORY_BEFORE}" "${HISTORY_AFTER}"

# -------------------------------------------------------------------
# 10. Cooldown expiry test: manually expire cooldown, then re-trigger
# -------------------------------------------------------------------
echo ""
echo "--- Testing cooldown expiry and re-trigger ---"

# Manually backdate last_triggered so cooldown has expired
psql_cmd -c "
UPDATE alert_state SET last_triggered = NOW() - INTERVAL '5 hours'
WHERE rule_id IN ('composite_critical', 'vix_spike');
" >/dev/null

# Reset consecutive_count so composite_critical needs to build up again
psql_cmd -c "
UPDATE alert_state SET consecutive_count = 0 WHERE rule_id = 'composite_critical';
" >/dev/null

# Insert new readings with different values so consecutive_count increments
RETRIGGER_VALUES=(79.0 83.0 81.5)
for iter in 1 2 3; do
    COMP_VAL="${RETRIGGER_VALUES[$((iter-1))]}"
    psql_cmd -c "INSERT INTO time_series (time, ticker, value, source) VALUES (NOW(), 'SCORE_COMPOSITE', ${COMP_VAL}, 'e2e-test') ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value;" >/dev/null
    # Also insert a new VIX reading so vix_spike re-triggers
    psql_cmd -c "INSERT INTO time_series (time, ticker, value, source) VALUES (NOW(), 'VIX', 36.${iter}, 'e2e-test') ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value;" >/dev/null
    sleep 1
    python3 -c "
import sys
sys.path.insert(0, '${CORRELATION_DIR}')
from alerting.rules_engine import evaluate_rules, load_alert_config

config = load_alert_config('${ALERT_CONFIG}')
fired = evaluate_rules('${DB_URL}', config)
if fired:
    for a in fired:
        print(f'  Re-fired: {a[\"rule_id\"]}')
" 2>/dev/null
done

COMPOSITE_AFTER_EXPIRY=$(psql_value "SELECT COUNT(*) FROM alert_history WHERE rule_id = 'composite_critical';")
assert_eq "composite_critical re-fired after cooldown expiry" "2" "${COMPOSITE_AFTER_EXPIRY}"

VIX_AFTER_EXPIRY=$(psql_value "SELECT COUNT(*) FROM alert_history WHERE rule_id = 'vix_spike';")
assert_eq "vix_spike re-fired after cooldown expiry" "2" "${VIX_AFTER_EXPIRY}"

# -------------------------------------------------------------------
# 11. API test: GET /api/risk/alerts via the app service
# -------------------------------------------------------------------
echo ""
echo "--- Starting app service for API tests ---"
${DC} up -d app

echo "--- Waiting for app service ---"
for i in $(seq 1 90); do
    if curl -sf http://localhost:3000 >/dev/null 2>&1; then
        echo "App service ready (attempt ${i})"
        break
    fi
    if [ "$i" -eq 90 ]; then
        echo "FAIL: App service did not start in 90 seconds" >&2
        exit 1
    fi
    sleep 1
done

echo "--- Testing GET /api/risk/alerts ---"
ALERTS_RESPONSE=$(curl -sf "http://localhost:3000/api/risk/alerts")

ALERTS_COUNT=$(echo "${ALERTS_RESPONSE}" | jq '.alerts | length')
assert_ge "GET /api/risk/alerts returns alerts" "2" "${ALERTS_COUNT}"

# Verify response fields
FIRST_ALERT_FIELDS=$(echo "${ALERTS_RESPONSE}" | jq '.alerts[0] | has("id") and has("rule_id") and has("triggered_at") and has("value") and has("message") and has("channels") and has("delivered")')
assert_eq "alert response has correct fields" "true" "${FIRST_ALERT_FIELDS}"

# Verify one of the alerts is composite_critical
HAS_COMPOSITE=$(echo "${ALERTS_RESPONSE}" | jq '[.alerts[].rule_id] | any(. == "composite_critical")')
assert_eq "response contains composite_critical alert" "true" "${HAS_COMPOSITE}"

HAS_VIX=$(echo "${ALERTS_RESPONSE}" | jq '[.alerts[].rule_id] | any(. == "vix_spike")')
assert_eq "response contains vix_spike alert" "true" "${HAS_VIX}"

# -------------------------------------------------------------------
# 12. API test: POST /api/risk/alerts (acknowledge)
# -------------------------------------------------------------------
echo ""
echo "--- Testing POST /api/risk/alerts (acknowledge) ---"

# Get an alert ID to acknowledge
ALERT_ID=$(echo "${ALERTS_RESPONSE}" | jq '.alerts[0].id')

ACK_RESPONSE=$(curl -sf -X POST "http://localhost:3000/api/risk/alerts" \
    -H "Content-Type: application/json" \
    -d "{\"id\": ${ALERT_ID}}")

ACK_DELIVERED=$(echo "${ACK_RESPONSE}" | jq '.alert.delivered')
assert_eq "acknowledged alert has delivered=true" "true" "${ACK_DELIVERED}"

ACK_ID=$(echo "${ACK_RESPONSE}" | jq '.alert.id')
assert_eq "acknowledged alert ID matches" "${ALERT_ID}" "${ACK_ID}"

# Verify bad request handling
BAD_ACK_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:3000/api/risk/alerts" \
    -H "Content-Type: application/json" \
    -d '{"id": "not_a_number"}')
assert_eq "POST with non-integer id returns 400" "400" "${BAD_ACK_STATUS}"

NOT_FOUND_STATUS=$(curl -s -o /dev/null -w '%{http_code}' -X POST "http://localhost:3000/api/risk/alerts" \
    -H "Content-Type: application/json" \
    -d '{"id": 999999}')
assert_eq "POST with unknown id returns 404" "404" "${NOT_FOUND_STATUS}"

# -------------------------------------------------------------------
# Summary
# -------------------------------------------------------------------
echo ""
echo "=== E2E Alerting Test Results ==="
echo "Passed: ${PASS_COUNT}"
echo "Failed: ${FAIL_COUNT}"
echo ""

if [ "${FAIL_COUNT}" -gt 0 ]; then
    echo "FAIL: ${FAIL_COUNT} test(s) failed" >&2
    exit 1
fi

echo "=== All E2E alerting tests passed ==="
