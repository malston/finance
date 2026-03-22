import { NextResponse } from "next/server";
import { queryCorrelations } from "@/lib/timescaledb";
import {
  FRAMEWORK_CONFIG,
  parseFramework,
  type Framework,
} from "@/lib/framework-config";

interface CorrelationPoint {
  time: string;
  value: number;
}

interface MaxCurrent {
  pair: string;
  value: number;
  above_threshold: boolean;
}

interface CorrelationResponse {
  credit_tech: CorrelationPoint[];
  credit_energy: CorrelationPoint[];
  tech_energy: CorrelationPoint[];
  max_current: MaxCurrent;
  framework: Framework;
  threshold: number;
}

const TICKER_TO_KEY: Record<
  string,
  keyof Omit<CorrelationResponse, "max_current" | "framework" | "threshold">
> = {
  CORR_CREDIT_TECH: "credit_tech",
  CORR_CREDIT_ENERGY: "credit_energy",
  CORR_TECH_ENERGY: "tech_energy",
};

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const daysParam = url.searchParams.get("days");
  const framework = parseFramework(url.searchParams.get("framework"));
  const config = FRAMEWORK_CONFIG[framework];

  let days = 79;
  if (daysParam !== null) {
    const parsedDays = Number.parseInt(daysParam, 10);
    if (!Number.isNaN(parsedDays) && parsedDays > 0) {
      days = Math.min(parsedDays, 365);
    }
  }

  try {
    const rows = await queryCorrelations(days);

    const grouped: CorrelationResponse = {
      credit_tech: [],
      credit_energy: [],
      tech_energy: [],
      max_current: { pair: "credit_tech", value: 0, above_threshold: false },
      framework,
      threshold: config.contagionThreshold,
    };

    for (const row of rows) {
      const key = TICKER_TO_KEY[row.ticker];
      if (key) {
        grouped[key].push({ time: row.time, value: row.value });
      }
    }

    // Find max_current: the pair whose latest value has the highest absolute correlation
    let maxAbsValue = 0;
    let maxPair = "credit_tech";
    let maxValue = 0;

    for (const [ticker, key] of Object.entries(TICKER_TO_KEY)) {
      const series = grouped[key];
      if (series.length > 0) {
        const latest = series[series.length - 1];
        const absVal = Math.abs(latest.value);
        if (absVal > maxAbsValue) {
          maxAbsValue = absVal;
          maxPair = key;
          maxValue = latest.value;
        }
      }
    }

    grouped.max_current = {
      pair: maxPair,
      value: maxValue,
      above_threshold: maxAbsValue >= config.contagionThreshold,
    };

    return NextResponse.json(grouped);
  } catch (err) {
    console.error("[/api/risk/correlations]", err);
    return NextResponse.json(
      { error: "Failed to query correlation data" },
      { status: 500 },
    );
  }
}
