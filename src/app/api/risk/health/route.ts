import { NextResponse } from "next/server";
import { query } from "@/lib/timescaledb";

// Per-source staleness thresholds (must match Go config defaults)
const STALENESS_THRESHOLDS: Record<string, { minutes: number; label: string }> =
  {
    finnhub: { minutes: 15, label: "15m" },
    fred: { minutes: 1440, label: "24h" },
    valyu_filings: { minutes: 1440, label: "24h" },
    valyu_sentiment: { minutes: 120, label: "2h" },
    valyu_insider: { minutes: 1440, label: "24h" },
  };

interface SourceHealthRow {
  source: string;
  last_success: string | null;
  last_error: string | null;
  last_error_msg: string | null;
  consecutive_failures: number;
}

function isStale(source: string, lastSuccess: string | null): boolean {
  if (!lastSuccess) return true;

  const threshold = STALENESS_THRESHOLDS[source];
  if (!threshold) return false;

  const elapsed = Date.now() - new Date(lastSuccess).getTime();
  return elapsed > threshold.minutes * 60 * 1000;
}

export async function GET(): Promise<Response> {
  try {
    const rows: SourceHealthRow[] = await query(
      "SELECT source, last_success, last_error, last_error_msg, consecutive_failures FROM source_health ORDER BY source",
      [],
    );

    const sources = rows.map((row) => ({
      source: row.source,
      last_success: row.last_success,
      stale: isStale(row.source, row.last_success),
      staleness_threshold: STALENESS_THRESHOLDS[row.source]?.label ?? "unknown",
      consecutive_failures: row.consecutive_failures,
    }));

    return NextResponse.json({ sources });
  } catch (err) {
    console.error("health query failed:", err);
    return NextResponse.json(
      { error: "Failed to query source health" },
      { status: 500 },
    );
  }
}
