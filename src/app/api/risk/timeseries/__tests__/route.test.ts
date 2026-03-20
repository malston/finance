import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryTimeSeries } = vi.hoisted(() => {
  const mockQueryTimeSeries = vi.fn();
  return { mockQueryTimeSeries };
});

vi.mock("@/lib/timescaledb", () => ({
  queryTimeSeries: mockQueryTimeSeries,
}));

import { GET } from "@/app/api/risk/timeseries/route";

function makeRequest(params: Record<string, string>): Request {
  const url = new URL("http://localhost:3000/api/risk/timeseries");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe("GET /api/risk/timeseries", () => {
  beforeEach(() => {
    mockQueryTimeSeries.mockReset();
  });

  it("returns time series data as JSON array", async () => {
    const fakeData = [
      {
        time: "2026-01-15T00:00:00Z",
        ticker: "BAMLH0A0HYM2",
        value: 380.5,
        source: "fred",
      },
    ];
    mockQueryTimeSeries.mockResolvedValueOnce(fakeData);

    const response = await GET(
      makeRequest({ ticker: "BAMLH0A0HYM2", days: "79" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(fakeData);
  });

  it("returns 400 when ticker parameter is missing", async () => {
    const response = await GET(makeRequest({}));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("ticker");
  });

  it("uses default days=79 when days param not provided", async () => {
    mockQueryTimeSeries.mockResolvedValueOnce([]);

    await GET(makeRequest({ ticker: "BAMLH0A0HYM2" }));

    expect(mockQueryTimeSeries).toHaveBeenCalledWith("BAMLH0A0HYM2", 79);
  });

  it("parses days parameter as integer", async () => {
    mockQueryTimeSeries.mockResolvedValueOnce([]);

    await GET(makeRequest({ ticker: "BAMLH0A0HYM2", days: "30" }));

    expect(mockQueryTimeSeries).toHaveBeenCalledWith("BAMLH0A0HYM2", 30);
  });

  it("returns 500 on database error", async () => {
    mockQueryTimeSeries.mockRejectedValueOnce(new Error("connection refused"));

    const response = await GET(makeRequest({ ticker: "BAMLH0A0HYM2" }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it("sets JSON content type header", async () => {
    mockQueryTimeSeries.mockResolvedValueOnce([]);

    const response = await GET(makeRequest({ ticker: "BAMLH0A0HYM2" }));

    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});
