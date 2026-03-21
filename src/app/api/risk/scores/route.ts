import { NextResponse } from "next/server";
import { queryLatestPrices } from "@/lib/timescaledb";
import { getThreatLevel } from "@/lib/threat-levels";

const DOMAIN_TICKERS = [
  "SCORE_PRIVATE_CREDIT",
  "SCORE_AI_CONCENTRATION",
  "SCORE_ENERGY_GEO",
  "SCORE_CONTAGION",
  "SCORE_COMPOSITE",
] as const;

const DOMAIN_WEIGHTS: Record<string, { key: string; weight: number }> = {
  SCORE_PRIVATE_CREDIT: { key: "private_credit", weight: 0.3 },
  SCORE_AI_CONCENTRATION: { key: "ai_concentration", weight: 0.2 },
  SCORE_ENERGY_GEO: { key: "energy_geo", weight: 0.25 },
  SCORE_CONTAGION: { key: "contagion", weight: 0.25 },
};

export async function GET(_request: Request): Promise<Response> {
  try {
    const rows = await queryLatestPrices([...DOMAIN_TICKERS]);

    const byTicker: Record<string, { value: number; time: string }> = {};
    for (const row of rows) {
      byTicker[row.ticker] = { value: row.value, time: row.time };
    }

    const compositeRow = byTicker["SCORE_COMPOSITE"];
    const compositeScore = compositeRow?.value ?? null;
    const compositeLevel =
      compositeScore !== null ? getThreatLevel(compositeScore) : null;

    const domains: Record<
      string,
      {
        score: number | null;
        weight: number;
        level: string | null;
        color: string | null;
      }
    > = {};

    for (const [ticker, meta] of Object.entries(DOMAIN_WEIGHTS)) {
      const row = byTicker[ticker];
      const score = row?.value ?? null;
      const threatLevel = score !== null ? getThreatLevel(score) : null;
      domains[meta.key] = {
        score,
        weight: meta.weight,
        level: threatLevel?.level ?? null,
        color: threatLevel?.color ?? null,
      };
    }

    // updated_at is the most recent timestamp across all score rows
    let updatedAt: string | null = null;
    for (const row of rows) {
      if (!updatedAt || row.time > updatedAt) {
        updatedAt = row.time;
      }
    }

    return NextResponse.json({
      composite: {
        score: compositeScore,
        level: compositeLevel?.level ?? null,
        color: compositeLevel?.color ?? null,
      },
      domains,
      updated_at: updatedAt,
    });
  } catch (err) {
    console.error("Failed to fetch risk scores:", err);
    return NextResponse.json(
      { error: "Failed to fetch risk scores" },
      { status: 500 },
    );
  }
}
