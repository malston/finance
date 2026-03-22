import { NextResponse } from "next/server";
import { query } from "@/lib/timescaledb";
import { getFreshnessStatus } from "@/lib/freshness";

interface TickerFreshness {
  last_updated: string | null;
  source: string;
  status: string;
}

/**
 * Returns freshness status for all tracked tickers.
 * Queries the most recent time_series row per ticker to determine staleness.
 */
export async function GET(): Promise<Response> {
  try {
    const rows = await query(
      `SELECT DISTINCT ON (ticker) ticker, time AS last_updated, source
       FROM time_series
       WHERE time > NOW() - INTERVAL '90 days'
       ORDER BY ticker, time DESC`,
      [],
    );

    const tickers: Record<string, TickerFreshness> = {};
    for (const row of rows) {
      const lastUpdated = row.last_updated
        ? new Date(row.last_updated).toISOString()
        : null;
      tickers[row.ticker] = {
        last_updated: lastUpdated,
        source: row.source,
        status: getFreshnessStatus(lastUpdated, row.source),
      };
    }

    return NextResponse.json({ tickers });
  } catch (err) {
    console.error("[/api/risk/freshness]", err);
    return NextResponse.json(
      { error: "Failed to query freshness data" },
      { status: 500 },
    );
  }
}
