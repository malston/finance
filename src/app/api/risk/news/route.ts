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
  const limit = limitParam ? parseInt(limitParam, 10) : 10;

  try {
    const rows = await queryNewsSentiment(domain, limit);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("News sentiment query failed:", err);
    return NextResponse.json(
      { error: "Failed to query news sentiment" },
      { status: 500 },
    );
  }
}
