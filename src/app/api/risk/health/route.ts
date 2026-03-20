import { NextResponse } from "next/server";
import { querySourceHealth } from "@/lib/timescaledb";

// Per-source staleness thresholds in minutes
const STALENESS_THRESHOLDS: Record<string, number> = {
  finnhub: 15,
  fred: 1440, // 24 hours
  valyu_filings: 1440,
  valyu_sentiment: 120, // 2 hours
  valyu_insider: 1440,
};

// Human-readable threshold labels
const THRESHOLD_LABELS: Record<string, string> = {
  finnhub: "15m",
  fred: "24h",
  valyu_filings: "24h",
  valyu_sentiment: "2h",
  valyu_insider: "24h",
};

function isStale(lastSuccess: string, thresholdMinutes: number): boolean {
  const elapsed = Date.now() - new Date(lastSuccess).getTime();
  return elapsed >= thresholdMinutes * 60 * 1000;
}

export async function GET(): Promise<Response> {
  try {
    const rows = await querySourceHealth();

    const sources = rows.map((row) => {
      const thresholdMinutes = STALENESS_THRESHOLDS[row.source] ?? 1440; // default 24h
      const thresholdLabel = THRESHOLD_LABELS[row.source] ?? "24h";

      return {
        source: row.source,
        last_success: row.last_success,
        stale: isStale(row.last_success, thresholdMinutes),
        staleness_threshold: thresholdLabel,
        consecutive_failures: row.consecutive_failures,
      };
    });

    return NextResponse.json({ sources });
  } catch (err) {
    console.error("Source health query failed:", err);
    return NextResponse.json(
      { error: "Failed to query source health" },
      { status: 500 },
    );
  }
}
