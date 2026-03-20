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
