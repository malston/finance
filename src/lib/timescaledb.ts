import { Pool } from "pg";

export interface TimeSeriesRow {
  time: string;
  ticker: string;
  value: number;
  source: string;
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

  const effectiveDays = Math.max(days, 1);

  const sql = `
    SELECT time, ticker, value, source
    FROM time_series
    WHERE ticker = $1
      AND time >= NOW() - ($2 || ' days')::INTERVAL
    ORDER BY time ASC
  `;

  const result = await pool.query(sql, [ticker, effectiveDays]);
  return result.rows;
}

export interface SourceHealthRow {
  source: string;
  last_success: string;
  last_error: string | null;
  last_error_msg: string | null;
  consecutive_failures: number;
}

/**
 * Returns health status for all tracked data sources.
 */
export async function querySourceHealth(): Promise<SourceHealthRow[]> {
  const result = await pool.query(
    "SELECT source, last_success, last_error, last_error_msg, consecutive_failures FROM source_health ORDER BY source",
  );
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
