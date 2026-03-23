#!/usr/bin/env bash
set -euo pipefail

# Backfill historical market data from Yahoo Finance and FRED into TimescaleDB.
# The correlation service will compute indices, correlations, and scores
# on its next 5-minute cycle once sufficient data exists.
#
# Usage: FRED_API_KEY=... ./scripts/backfill-week.sh [days]
#   days: number of calendar days to fetch (default: 50, yields ~35 trading days
#         which exceeds the 30-day correlation window)

: "${FRED_API_KEY:?FRED_API_KEY is required}"

DAYS="${1:-50}"
DB_CONTAINER="${DB_CONTAINER:-financial-risk-monitor-timescaledb-1}"

db_exec() {
  docker exec -i "$DB_CONTAINER" psql -U risk -d riskmonitor -c "$1"
}

echo "=== Yahoo Finance equity data (${DAYS} calendar days) ==="

TICKERS=(
  OWL ARCC BXSL OBDC HYG
  NVDA MSFT GOOGL META AMZN
  SPY RSP SMH XLU EWT VIXY
  CL=F NG=F
)

for ticker in "${TICKERS[@]}"; do
  echo -n "  $ticker ... "

  resp=$(curl -s "https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${DAYS}d&interval=1d" \
    -H "User-Agent: Mozilla/5.0")

  echo "$resp" | python3 -c "
import sys, json
d = json.load(sys.stdin)
result = d.get('chart', {}).get('result')
if not result:
    print('-- no data for ' + sys.argv[1], file=sys.stderr)
    sys.exit(1)
r = result[0]
timestamps = r.get('timestamp', [])
closes = r['indicators']['quote'][0].get('close', [])
ticker = sys.argv[1]
values = []
for i in range(len(timestamps)):
    if closes[i] is None:
        continue
    values.append(f\"(to_timestamp({timestamps[i]}), '{ticker}', {closes[i]}, 'finnhub')\")
if values:
    sql = '''INSERT INTO time_series (time, ticker, value, source) VALUES
''' + ','.join(values) + '''
ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source;'''
    print(sql)
" "$ticker" | docker exec -i "$DB_CONTAINER" psql -U risk -d riskmonitor -q

  count=$(echo "$resp" | python3 -c "
import sys, json
d = json.load(sys.stdin)
r = d.get('chart', {}).get('result')
if r:
    closes = r[0]['indicators']['quote'][0].get('close', [])
    print(len([c for c in closes if c is not None]))
else:
    print(0)
")
  echo "OK ($count rows)"
  sleep 0.5
done

echo ""
echo "=== FRED series ==="

FRED_SERIES=(BAMLH0A0HYM2 DGS10 DGS2 T10Y2Y)
fred_from=$(date -u -v-"${DAYS}"d +%Y-%m-%d 2>/dev/null || date -u -d "${DAYS} days ago" +%Y-%m-%d)

for series in "${FRED_SERIES[@]}"; do
  echo -n "  $series ... "

  resp=$(curl -s "https://api.stlouisfed.org/fred/series/observations?series_id=${series}&api_key=${FRED_API_KEY}&file_type=json&observation_start=${fred_from}&sort_order=asc")

  echo "$resp" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'error_message' in d:
    print('FRED API error: ' + d['error_message'], file=sys.stderr)
    sys.exit(1)
obs = d.get('observations', [])
ticker = sys.argv[1]
values = []
for o in obs:
    if o['value'] == '.':
        continue
    date = o['date']
    val = float(o['value'])
    values.append(f\"('{date}T12:00:00Z', '{ticker}', {val}, 'fred')\")
if values:
    sql = '''INSERT INTO time_series (time, ticker, value, source) VALUES
''' + ','.join(values) + '''
ON CONFLICT (time, ticker) DO UPDATE SET value = EXCLUDED.value, source = EXCLUDED.source;'''
    print(sql)
else:
    print('-- no data')
" "$series" | docker exec -i "$DB_CONTAINER" psql -U risk -d riskmonitor -q

  count=$(echo "$resp" | python3 -c "import sys,json; print(len([o for o in json.load(sys.stdin).get('observations',[]) if o['value'] != '.']))")
  echo "OK ($count rows)"
  sleep 0.5
done

echo ""
echo "=== Verifying row counts ==="
db_exec "SELECT ticker, COUNT(*) as rows, MIN(time)::date as earliest, MAX(time)::date as latest FROM time_series GROUP BY ticker ORDER BY ticker;"

echo ""
echo "Done. The correlation service will compute indices and scores on its next cycle (up to 5 min)."
