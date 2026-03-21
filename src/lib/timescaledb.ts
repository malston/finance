import { Pool } from "pg";

export interface TimeSeriesRow {
  time: string;
  ticker: string;
  value: number;
  source: string;
}

export interface SourceHealthRow {
  source: string;
  last_success: string | null;
  last_error: string | null;
  last_error_msg: string | null;
  consecutive_failures: number;
}

export interface NewsSentimentRow {
  time: string;
  domain: string;
  headline: string;
  sentiment: number;
  source_name: string;
  source_url: string;
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Executes an arbitrary SQL query and returns the resulting rows.
 */
export async function query(sql: string, params: any[]): Promise<any[]> {
  const result = await pool.query(sql, params);
  return result.rows;
}

/**
 * Queries time series data for a given ticker, returning the most recent N trading days.
 */
export async function queryTimeSeries(
  ticker: string,
  days: number = 79,
): Promise<TimeSeriesRow[]> {
  if (!ticker) {
    throw new Error("ticker is required");
  }

  if (!Number.isFinite(days)) {
    return [];
  }

  const effectiveDays = Math.max(days, 1);

  const sql = `
    SELECT time, ticker, value, source
    FROM time_series
    WHERE ticker = $1
      AND time >= NOW() - ($2 * INTERVAL '1 day')
    ORDER BY time ASC
  `;

  const result = await pool.query(sql, [ticker, effectiveDays]);
  return result.rows;
}

/**
 * Returns the latest price for each of the given tickers.
 * One row per ticker with the most recent time, value, and source.
 */
const CORRELATION_TICKERS = [
  "CORR_CREDIT_TECH",
  "CORR_CREDIT_ENERGY",
  "CORR_TECH_ENERGY",
];

/**
 * Queries all three pairwise correlation time series for the specified number of trading days.
 */
export async function queryCorrelations(
  days: number = 79,
): Promise<TimeSeriesRow[]> {
  const effectiveDays = Math.max(days, 1);

  const sql = `
    SELECT time, ticker, value, source
    FROM time_series
    WHERE ticker = ANY($1)
      AND time >= NOW() - ($2 * INTERVAL '1 day')
    ORDER BY time ASC
  `;

  const result = await pool.query(sql, [CORRELATION_TICKERS, effectiveDays]);
  return result.rows;
}

/**
 * Returns the latest price for each of the given tickers.
 * One row per ticker with the most recent time, value, and source.
 */
export async function queryLatestPrices(
  tickers: string[],
): Promise<TimeSeriesRow[]> {
  if (tickers.length === 0) return [];

  const sql = `
    SELECT DISTINCT ON (ticker) time, ticker, value, source
    FROM time_series
    WHERE ticker = ANY($1)
    ORDER BY ticker, time DESC
  `;

  const result = await pool.query(sql, [tickers]);
  return result.rows;
}

/**
 * Returns health status for all tracked data sources.
 */
export async function querySourceHealth(): Promise<SourceHealthRow[]> {
  const sql = `
    SELECT source, last_success, last_error, last_error_msg, consecutive_failures
    FROM source_health
    ORDER BY source
  `;

  const result = await pool.query(sql, []);
  return result.rows;
}

/**
 * Queries recent news sentiment headlines for a given domain.
 */
export async function queryNewsSentiment(
  domain: string,
  limit: number = 10,
): Promise<NewsSentimentRow[]> {
  if (!domain) {
    throw new Error("domain is required");
  }

  const effectiveLimit = Math.max(Math.min(limit, 100), 1);

  const sql = `
    SELECT time, domain, headline, sentiment, source_name, source_url
    FROM news_sentiment
    WHERE domain = $1
    ORDER BY time DESC
    LIMIT $2
  `;

  const result = await pool.query(sql, [domain, effectiveLimit]);
  return result.rows;
}
