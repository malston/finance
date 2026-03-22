import { NextResponse } from "next/server";
import { queryTimeSeries } from "@/lib/timescaledb";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const ticker = url.searchParams.get("ticker");

  if (!ticker) {
    return NextResponse.json(
      { error: "ticker query parameter is required" },
      { status: 400 },
    );
  }

  const daysParam = url.searchParams.get("days");
  const days = Math.min(daysParam ? parseInt(daysParam, 10) : 79, 365);

  if (!Number.isFinite(days) || days < 1) {
    return NextResponse.json(
      { error: "days must be a positive integer" },
      { status: 400 },
    );
  }

  try {
    const rows = await queryTimeSeries(ticker, days);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[/api/risk/timeseries]", err);
    return NextResponse.json(
      { error: "Failed to query time series data" },
      { status: 500 },
    );
  }
}
