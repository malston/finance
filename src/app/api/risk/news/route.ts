import { NextResponse } from "next/server";
import { queryNewsSentiment } from "@/lib/timescaledb";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");

  if (!domain) {
    return NextResponse.json(
      { error: "domain query parameter is required" },
      { status: 400 },
    );
  }

  const limitParam = url.searchParams.get("limit");
  let limit = 10;
  if (limitParam !== null) {
    const parsedLimit = parseInt(limitParam, 10);
    if (!Number.isNaN(parsedLimit)) {
      limit = Math.min(50, Math.max(1, parsedLimit));
    }
  }

  try {
    const rows = await queryNewsSentiment(domain, limit);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[/api/risk/news]", err);
    return NextResponse.json(
      { error: "Failed to query news sentiment" },
      { status: 500 },
    );
  }
}
