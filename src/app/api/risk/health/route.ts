import { NextResponse } from "next/server";
import { querySourceHealth } from "@/lib/timescaledb";

// Per-source staleness thresholds (must match Go config defaults)
const STALENESS_THRESHOLDS: Record<string, { minutes: number; label: string }> =
  {
    finnhub: { minutes: 15, label: "15m" },
    fred: { minutes: 1440, label: "24h" },
    valyu_filings: { minutes: 1440, label: "24h" },
    valyu_sentiment: { minutes: 120, label: "2h" },
    valyu_insider: { minutes: 1440, label: "24h" },
  };

function isStale(source: string, lastSuccess: string | null): boolean {
  if (!lastSuccess) return true;

  const threshold = STALENESS_THRESHOLDS[source];
  if (!threshold) return true;

  const elapsed = Date.now() - new Date(lastSuccess).getTime();
  return elapsed > threshold.minutes * 60 * 1000;
}

export async function GET(): Promise<Response> {
  try {
    const rows = await querySourceHealth();

    const sources = rows.map((row) => ({
      source: row.source,
      last_success: row.last_success,
      stale: isStale(row.source, row.last_success),
      staleness_threshold: STALENESS_THRESHOLDS[row.source]?.label ?? "unknown",
      consecutive_failures: row.consecutive_failures,
    }));

    return NextResponse.json({ sources });
  } catch (err) {
    console.error("[/api/risk/health]", err);
    return NextResponse.json(
      { error: "Failed to query source health" },
      { status: 500 },
    );
  }
}
