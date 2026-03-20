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
