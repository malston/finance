import { NextResponse } from "next/server";
import { queryNewsSentiment } from "@/lib/timescaledb";
import { FRAMEWORK_CONFIG, parseFramework } from "@/lib/framework-config";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const domain = url.searchParams.get("domain");

  if (!domain) {
    return NextResponse.json(
      { error: "domain query parameter is required" },
      { status: 400 },
    );
  }

  const framework = parseFramework(url.searchParams.get("framework"));
  const config = FRAMEWORK_CONFIG[framework];

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

    // Sort by sentiment: ascending for risk-focused (bookstaber),
    // descending for resilience-focused (yardeni)
    const sorted = [...rows].sort((a, b) => {
      return config.newsSortDirection === "asc"
        ? a.sentiment - b.sentiment
        : b.sentiment - a.sentiment;
    });

    return NextResponse.json({ items: sorted, framework });
  } catch (err) {
    console.error("[/api/risk/news]", err);
    return NextResponse.json(
      { error: "Failed to query news sentiment" },
      { status: 500 },
    );
  }
}
