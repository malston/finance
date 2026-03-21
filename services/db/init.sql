CREATE EXTENSION IF NOT EXISTS timescaledb;

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

CREATE TABLE IF NOT EXISTS news_sentiment (
  id          SERIAL PRIMARY KEY,
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  domain      TEXT NOT NULL,
  headline    TEXT NOT NULL,
  sentiment   DOUBLE PRECISION NOT NULL,
  source_name TEXT,
  source_url  TEXT
);

CREATE INDEX IF NOT EXISTS idx_news_sentiment_domain_time
  ON news_sentiment (domain, time DESC);

CREATE TABLE IF NOT EXISTS insider_trades (
  id          SERIAL PRIMARY KEY,
  time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ticker      TEXT NOT NULL,
  insider_name TEXT NOT NULL,
  trade_type  TEXT NOT NULL,
  shares      INTEGER NOT NULL,
  price       DOUBLE PRECISION,
  source_url  TEXT
);

CREATE INDEX IF NOT EXISTS idx_insider_trades_ticker_time
  ON insider_trades (ticker, time DESC);

CREATE TABLE IF NOT EXISTS alert_state (
  rule_id           TEXT PRIMARY KEY,
  consecutive_count INTEGER NOT NULL DEFAULT 0,
  last_triggered    TIMESTAMPTZ,
  last_value        DOUBLE PRECISION
);

CREATE TABLE IF NOT EXISTS alert_history (
  id           SERIAL PRIMARY KEY,
  rule_id      TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  value        DOUBLE PRECISION NOT NULL,
  message      TEXT NOT NULL,
  channels     TEXT[] NOT NULL,
  delivered    BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_alert_history_rule_id_triggered
  ON alert_history (rule_id, triggered_at DESC);
