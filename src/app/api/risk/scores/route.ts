import { NextResponse } from "next/server";
import { queryLatestPrices } from "@/lib/timescaledb";
import { getThreatLevel } from "@/lib/threat-levels";
import { FRAMEWORK_CONFIG, parseFramework } from "@/lib/framework-config";

const BASE_DOMAIN_TICKERS = [
  "SCORE_PRIVATE_CREDIT",
  "SCORE_AI_CONCENTRATION",
  "SCORE_ENERGY_GEO",
  "SCORE_CONTAGION",
  "SCORE_COMPOSITE",
] as const;

const TICKER_TO_DOMAIN_KEY: Record<string, string> = {
  SCORE_PRIVATE_CREDIT: "private_credit",
  SCORE_AI_CONCENTRATION: "ai_concentration",
  SCORE_ENERGY_GEO: "energy_geo",
  SCORE_CONTAGION: "contagion",
};

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const framework = parseFramework(url.searchParams.get("framework"));
    const config = FRAMEWORK_CONFIG[framework];

    const tickers = BASE_DOMAIN_TICKERS.map(
      (t) => `${config.tickerPrefix}${t}`,
    );
    const rows = await queryLatestPrices(tickers);

    const byTicker: Record<string, { value: number; time: string }> = {};
    for (const row of rows) {
      byTicker[row.ticker] = { value: row.value, time: row.time };
    }

    const compositeTicker = `${config.tickerPrefix}SCORE_COMPOSITE`;
    const compositeRow = byTicker[compositeTicker];
    const compositeScore = compositeRow?.value ?? null;
    const compositeLevel =
      compositeScore !== null
        ? getThreatLevel(compositeScore, framework)
        : null;

    const domains: Record<
      string,
      {
        score: number | null;
        weight: number;
        level: string | null;
        color: string | null;
      }
    > = {};

    for (const baseTicker of BASE_DOMAIN_TICKERS) {
      const domainKey = TICKER_TO_DOMAIN_KEY[baseTicker];
      if (!domainKey) continue;

      const prefixedTicker = `${config.tickerPrefix}${baseTicker}`;
      const row = byTicker[prefixedTicker];
      const score = row?.value ?? null;
      const threatLevel =
        score !== null ? getThreatLevel(score, framework) : null;
      const weight = config.weights[domainKey as keyof typeof config.weights];
      domains[domainKey] = {
        score,
        weight,
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

    const response: Record<string, unknown> = {
      composite: {
        score: compositeScore,
        level: compositeLevel?.level ?? null,
        color: compositeLevel?.color ?? null,
      },
      domains,
      updated_at: updatedAt,
      framework,
    };

    if (compositeScore === null) {
      response.stale = true;
      response.message = "Scoring pipeline has not produced results yet";
    }

    return NextResponse.json(response);
  } catch (err) {
    console.error("[/api/risk/scores]", err);
    return NextResponse.json(
      { error: "Failed to fetch risk scores" },
      { status: 500 },
    );
  }
}
