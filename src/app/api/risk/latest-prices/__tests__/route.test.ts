import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryLatestPrices } = vi.hoisted(() => {
  const mockQueryLatestPrices = vi.fn();
  return { mockQueryLatestPrices };
});

vi.mock("@/lib/timescaledb", () => ({
  queryLatestPrices: mockQueryLatestPrices,
}));

import { GET } from "@/app/api/risk/latest-prices/route";

describe("GET /api/risk/latest-prices", () => {
  beforeEach(() => {
    mockQueryLatestPrices.mockReset();
  });

  it("returns latest prices as JSON array", async () => {
    const fakeData = [
      {
        time: "2026-03-20T15:00:00Z",
        ticker: "NVDA",
        value: 875.5,
        source: "finnhub",
      },
      {
        time: "2026-03-20T15:00:00Z",
        ticker: "MSFT",
        value: 425.0,
        source: "finnhub",
      },
    ];
    mockQueryLatestPrices.mockResolvedValueOnce(fakeData);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(fakeData);
  });

  it("passes the configured ticker list to the query", async () => {
    mockQueryLatestPrices.mockResolvedValueOnce([]);

    await GET();

    expect(mockQueryLatestPrices).toHaveBeenCalledTimes(1);
    const tickers = mockQueryLatestPrices.mock.calls[0][0];
    expect(tickers).toContain("NVDA");
    expect(tickers).toContain("OWL");
    expect(tickers).toContain("VIX");
    expect(tickers).toContain("SPY");
    expect(tickers.length).toBe(18);
  });

  it("returns 500 on database error", async () => {
    mockQueryLatestPrices.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it("sets JSON content type header", async () => {
    mockQueryLatestPrices.mockResolvedValueOnce([]);

    const response = await GET();

    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});
