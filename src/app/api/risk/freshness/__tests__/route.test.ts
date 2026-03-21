import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  return { mockQuery };
});

vi.mock("@/lib/timescaledb", () => ({
  query: mockQuery,
}));

import { GET } from "@/app/api/risk/freshness/route";

describe("GET /api/risk/freshness", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns freshness data for multiple tickers", async () => {
    const now = new Date();
    const recentTime = new Date(now.getTime() - 5 * 60 * 1000);

    mockQuery.mockResolvedValueOnce([
      {
        ticker: "SPY",
        last_updated: recentTime.toISOString(),
        source: "finnhub",
      },
      {
        ticker: "DFF",
        last_updated: recentTime.toISOString(),
        source: "fred",
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tickers).toBeDefined();
    expect(body.tickers.SPY).toBeDefined();
    expect(body.tickers.SPY.source).toBe("finnhub");
    expect(body.tickers.DFF).toBeDefined();
    expect(body.tickers.DFF.source).toBe("fred");
  });

  it("uses DISTINCT ON to pick latest per ticker (multi-source ticker gets one entry)", async () => {
    const now = new Date();
    const recentTime = new Date(now.getTime() - 5 * 60 * 1000);

    // DISTINCT ON returns one row per ticker (the most recent)
    mockQuery.mockResolvedValueOnce([
      {
        ticker: "SPY",
        last_updated: recentTime.toISOString(),
        source: "finnhub",
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tickers.SPY).toBeDefined();
    expect(body.tickers.SPY.source).toBe("finnhub");

    // Verify the SQL uses DISTINCT ON
    const sql = mockQuery.mock.calls[0][0] as string;
    expect(sql).toContain("DISTINCT ON");
    expect(sql).toContain("ORDER BY ticker, time DESC");
  });

  it("returns empty tickers object when table is empty", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.tickers).toEqual({});
  });

  it("returns 500 on database error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});
