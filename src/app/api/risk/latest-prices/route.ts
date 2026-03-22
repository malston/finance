import { NextResponse } from "next/server";
import { queryLatestPrices } from "@/lib/timescaledb";

// Tickers displayed in the Equity & ETF Prices card
const DISPLAY_TICKERS = [
  "OWL",
  "ARCC",
  "BXSL",
  "OBDC",
  "NVDA",
  "MSFT",
  "GOOGL",
  "META",
  "AMZN",
  "SPY",
  "RSP",
  "SMH",
  "HYG",
  "XLU",
  "EWT",
  "VIXY",
];

export async function GET(): Promise<Response> {
  try {
    const rows = await queryLatestPrices(DISPLAY_TICKERS);
    return NextResponse.json(rows);
  } catch (err) {
    console.error("[/api/risk/latest-prices]", err);
    return NextResponse.json(
      { error: "Failed to query latest prices" },
      { status: 500 },
    );
  }
}
