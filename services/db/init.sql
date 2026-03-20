CREATE TABLE IF NOT EXISTS time_series (
  time        TIMESTAMPTZ NOT NULL,
  ticker      TEXT NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  source      TEXT NOT NULL,
  UNIQUE (time, ticker)
);

SELECT create_hypertable('time_series', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_time_series_ticker_time
  ON time_series (ticker, time DESC);

CREATE TABLE IF NOT EXISTS source_health (
  source              TEXT PRIMARY KEY,
  last_success        TIMESTAMPTZ,
  last_error          TIMESTAMPTZ,
  last_error_msg      TEXT,
  consecutive_failures INTEGER NOT NULL DEFAULT 0
);
