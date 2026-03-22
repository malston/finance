import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryCorrelations } = vi.hoisted(() => {
  const mockQueryCorrelations = vi.fn();
  return { mockQueryCorrelations };
});

vi.mock("@/lib/timescaledb", () => ({
  queryCorrelations: mockQueryCorrelations,
}));

import { GET } from "@/app/api/risk/correlations/route";

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:3000/api/risk/correlations");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

const SAMPLE_ROWS = [
  {
    time: "2026-01-15T00:00:00Z",
    ticker: "CORR_CREDIT_TECH",
    value: 0.42,
    source: "computed",
  },
  {
    time: "2026-01-16T00:00:00Z",
    ticker: "CORR_CREDIT_TECH",
    value: 0.45,
    source: "computed",
  },
  {
    time: "2026-01-15T00:00:00Z",
    ticker: "CORR_CREDIT_ENERGY",
    value: 0.31,
    source: "computed",
  },
  {
    time: "2026-01-16T00:00:00Z",
    ticker: "CORR_CREDIT_ENERGY",
    value: 0.35,
    source: "computed",
  },
  {
    time: "2026-01-15T00:00:00Z",
    ticker: "CORR_TECH_ENERGY",
    value: -0.62,
    source: "computed",
  },
  {
    time: "2026-01-16T00:00:00Z",
    ticker: "CORR_TECH_ENERGY",
    value: -0.58,
    source: "computed",
  },
];

describe("GET /api/risk/correlations", () => {
  beforeEach(() => {
    mockQueryCorrelations.mockReset();
  });

  it("returns all three correlation pairs grouped by ticker", async () => {
    mockQueryCorrelations.mockResolvedValueOnce(SAMPLE_ROWS);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.credit_tech).toHaveLength(2);
    expect(body.credit_energy).toHaveLength(2);
    expect(body.tech_energy).toHaveLength(2);
  });

  it("returns {time, value} objects sorted by time ascending", async () => {
    mockQueryCorrelations.mockResolvedValueOnce(SAMPLE_ROWS);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.credit_tech[0]).toEqual({
      time: "2026-01-15T00:00:00Z",
      value: 0.42,
    });
    expect(body.credit_tech[1]).toEqual({
      time: "2026-01-16T00:00:00Z",
      value: 0.45,
    });
  });

  it("returns max_current with pair name, value, and above_threshold", async () => {
    mockQueryCorrelations.mockResolvedValueOnce(SAMPLE_ROWS);

    const response = await GET(makeRequest());
    const body = await response.json();

    // CORR_TECH_ENERGY has abs(-0.58) = 0.58 as the latest, which is highest
    expect(body.max_current.pair).toBe("tech_energy");
    expect(body.max_current.value).toBeCloseTo(-0.58);
    expect(body.max_current.above_threshold).toBe(true);
  });

  it("uses threshold of 0.5 for above_threshold", async () => {
    const lowCorrelationRows = [
      {
        time: "2026-01-16T00:00:00Z",
        ticker: "CORR_CREDIT_TECH",
        value: 0.3,
        source: "computed",
      },
      {
        time: "2026-01-16T00:00:00Z",
        ticker: "CORR_CREDIT_ENERGY",
        value: 0.2,
        source: "computed",
      },
      {
        time: "2026-01-16T00:00:00Z",
        ticker: "CORR_TECH_ENERGY",
        value: -0.1,
        source: "computed",
      },
    ];
    mockQueryCorrelations.mockResolvedValueOnce(lowCorrelationRows);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(body.max_current.above_threshold).toBe(false);
    expect(body.max_current.value).toBeCloseTo(0.3);
  });

  it("returns empty arrays and max_current.value=0 when no data exists", async () => {
    mockQueryCorrelations.mockResolvedValueOnce([]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.credit_tech).toEqual([]);
    expect(body.credit_energy).toEqual([]);
    expect(body.tech_energy).toEqual([]);
    expect(body.max_current).toEqual({
      pair: "credit_tech",
      value: 0,
      above_threshold: false,
    });
  });

  it("defaults days to 79 when not provided", async () => {
    mockQueryCorrelations.mockResolvedValueOnce([]);

    await GET(makeRequest());

    expect(mockQueryCorrelations).toHaveBeenCalledWith(79);
  });

  it("parses days parameter as integer", async () => {
    mockQueryCorrelations.mockResolvedValueOnce([]);

    await GET(makeRequest({ days: "30" }));

    expect(mockQueryCorrelations).toHaveBeenCalledWith(30);
  });

  it("returns 500 on database error", async () => {
    mockQueryCorrelations.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it("sets JSON content type header", async () => {
    mockQueryCorrelations.mockResolvedValueOnce([]);

    const response = await GET(makeRequest());

    expect(response.headers.get("Content-Type")).toContain("application/json");
  });

  describe("framework parameter", () => {
    it("includes framework field in response defaulting to bookstaber", async () => {
      mockQueryCorrelations.mockResolvedValueOnce([]);

      const response = await GET(makeRequest());
      const body = await response.json();

      expect(body.framework).toBe("bookstaber");
    });

    it("includes framework=yardeni when requested", async () => {
      mockQueryCorrelations.mockResolvedValueOnce([]);

      const response = await GET(makeRequest({ framework: "yardeni" }));
      const body = await response.json();

      expect(body.framework).toBe("yardeni");
    });

    it("includes threshold field in response", async () => {
      mockQueryCorrelations.mockResolvedValueOnce([]);

      const response = await GET(makeRequest());
      const body = await response.json();

      expect(body.threshold).toBe(0.5);
    });

    it("uses threshold 0.85 when framework=yardeni", async () => {
      mockQueryCorrelations.mockResolvedValueOnce([]);

      const response = await GET(makeRequest({ framework: "yardeni" }));
      const body = await response.json();

      expect(body.threshold).toBe(0.85);
    });

    it("above_threshold uses 0.5 for bookstaber (value 0.58 is above)", async () => {
      mockQueryCorrelations.mockResolvedValueOnce(SAMPLE_ROWS);

      const response = await GET(makeRequest());
      const body = await response.json();

      // CORR_TECH_ENERGY latest abs(-0.58) = 0.58 >= 0.5
      expect(body.max_current.above_threshold).toBe(true);
    });

    it("above_threshold uses 0.85 for yardeni (value 0.58 is below)", async () => {
      mockQueryCorrelations.mockResolvedValueOnce(SAMPLE_ROWS);

      const response = await GET(makeRequest({ framework: "yardeni" }));
      const body = await response.json();

      // CORR_TECH_ENERGY latest abs(-0.58) = 0.58 < 0.85
      expect(body.max_current.above_threshold).toBe(false);
    });

    it("defaults to bookstaber for invalid framework value", async () => {
      mockQueryCorrelations.mockResolvedValueOnce([]);

      const response = await GET(makeRequest({ framework: "invalid" }));
      const body = await response.json();

      expect(body.framework).toBe("bookstaber");
      expect(body.threshold).toBe(0.5);
    });
  });
});
