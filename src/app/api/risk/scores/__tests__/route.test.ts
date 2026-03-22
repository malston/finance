import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryLatestPrices } = vi.hoisted(() => {
  const mockQueryLatestPrices = vi.fn();
  return { mockQueryLatestPrices };
});

vi.mock("@/lib/timescaledb", () => ({
  queryLatestPrices: mockQueryLatestPrices,
}));

import { GET } from "@/app/api/risk/scores/route";

function makeRequest(params: Record<string, string> = {}): Request {
  const url = new URL("http://localhost:3000/api/risk/scores");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString());
}

describe("GET /api/risk/scores", () => {
  beforeEach(() => {
    mockQueryLatestPrices.mockReset();
  });

  it("returns composite and domain scores when all present", async () => {
    mockQueryLatestPrices.mockResolvedValueOnce([
      {
        time: "2026-03-20T10:00:00Z",
        ticker: "SCORE_PRIVATE_CREDIT",
        value: 68,
        source: "computed",
      },
      {
        time: "2026-03-20T10:00:00Z",
        ticker: "SCORE_AI_CONCENTRATION",
        value: 52,
        source: "computed",
      },
      {
        time: "2026-03-20T10:00:00Z",
        ticker: "SCORE_ENERGY_GEO",
        value: 74,
        source: "computed",
      },
      {
        time: "2026-03-20T10:00:00Z",
        ticker: "SCORE_CONTAGION",
        value: 61,
        source: "computed",
      },
      {
        time: "2026-03-20T10:05:00Z",
        ticker: "SCORE_COMPOSITE",
        value: 64.55,
        source: "computed",
      },
    ]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.composite.score).toBeCloseTo(64.55, 1);
    expect(body.composite.level).toBe("HIGH");
    expect(body.composite.color).toBe("#f97316");

    expect(body.domains.private_credit.score).toBe(68);
    expect(body.domains.private_credit.weight).toBe(0.3);
    expect(body.domains.private_credit.level).toBe("HIGH");

    expect(body.domains.ai_concentration.score).toBe(52);
    expect(body.domains.ai_concentration.weight).toBe(0.2);

    expect(body.domains.energy_geo.score).toBe(74);
    expect(body.domains.energy_geo.weight).toBe(0.25);

    expect(body.domains.contagion.score).toBe(61);
    expect(body.domains.contagion.weight).toBe(0.25);

    expect(body.updated_at).toBe("2026-03-20T10:05:00Z");
  });

  it("returns null for missing domain scores", async () => {
    mockQueryLatestPrices.mockResolvedValueOnce([
      {
        time: "2026-03-20T10:00:00Z",
        ticker: "SCORE_PRIVATE_CREDIT",
        value: 55,
        source: "computed",
      },
      {
        time: "2026-03-20T10:05:00Z",
        ticker: "SCORE_COMPOSITE",
        value: 55,
        source: "computed",
      },
    ]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.domains.private_credit.score).toBe(55);
    expect(body.domains.ai_concentration.score).toBeNull();
    expect(body.domains.energy_geo.score).toBeNull();
    expect(body.domains.contagion.score).toBeNull();
  });

  it("returns null composite when SCORE_COMPOSITE is missing", async () => {
    mockQueryLatestPrices.mockResolvedValueOnce([]);

    const response = await GET(makeRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.composite.score).toBeNull();
    expect(body.composite.level).toBeNull();
    expect(body.composite.color).toBeNull();
    expect(body.stale).toBe(true);
    expect(body.message).toBe("Scoring pipeline has not produced results yet");
  });

  it("queries correct tickers", async () => {
    mockQueryLatestPrices.mockResolvedValueOnce([]);

    await GET(makeRequest());

    expect(mockQueryLatestPrices).toHaveBeenCalledWith([
      "SCORE_PRIVATE_CREDIT",
      "SCORE_AI_CONCENTRATION",
      "SCORE_ENERGY_GEO",
      "SCORE_CONTAGION",
      "SCORE_COMPOSITE",
    ]);
  });

  it("returns 500 on database error", async () => {
    mockQueryLatestPrices.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const response = await GET(makeRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it("sets JSON content type header", async () => {
    mockQueryLatestPrices.mockResolvedValueOnce([]);

    const response = await GET(makeRequest());

    expect(response.headers.get("Content-Type")).toContain("application/json");
  });

  describe("framework parameter", () => {
    it("defaults to bookstaber tickers when no framework specified", async () => {
      mockQueryLatestPrices.mockResolvedValueOnce([]);

      await GET(makeRequest());

      expect(mockQueryLatestPrices).toHaveBeenCalledWith([
        "SCORE_PRIVATE_CREDIT",
        "SCORE_AI_CONCENTRATION",
        "SCORE_ENERGY_GEO",
        "SCORE_CONTAGION",
        "SCORE_COMPOSITE",
      ]);
    });

    it("queries YARDENI_ prefixed tickers when framework=yardeni", async () => {
      mockQueryLatestPrices.mockResolvedValueOnce([]);

      await GET(makeRequest({ framework: "yardeni" }));

      expect(mockQueryLatestPrices).toHaveBeenCalledWith([
        "YARDENI_SCORE_PRIVATE_CREDIT",
        "YARDENI_SCORE_AI_CONCENTRATION",
        "YARDENI_SCORE_ENERGY_GEO",
        "YARDENI_SCORE_CONTAGION",
        "YARDENI_SCORE_COMPOSITE",
      ]);
    });

    it("uses bookstaber tickers when framework=bookstaber", async () => {
      mockQueryLatestPrices.mockResolvedValueOnce([]);

      await GET(makeRequest({ framework: "bookstaber" }));

      expect(mockQueryLatestPrices).toHaveBeenCalledWith([
        "SCORE_PRIVATE_CREDIT",
        "SCORE_AI_CONCENTRATION",
        "SCORE_ENERGY_GEO",
        "SCORE_CONTAGION",
        "SCORE_COMPOSITE",
      ]);
    });

    it("defaults to bookstaber for invalid framework value", async () => {
      mockQueryLatestPrices.mockResolvedValueOnce([]);

      await GET(makeRequest({ framework: "invalid" }));

      expect(mockQueryLatestPrices).toHaveBeenCalledWith([
        "SCORE_PRIVATE_CREDIT",
        "SCORE_AI_CONCENTRATION",
        "SCORE_ENERGY_GEO",
        "SCORE_CONTAGION",
        "SCORE_COMPOSITE",
      ]);
    });

    it("includes framework field in response", async () => {
      mockQueryLatestPrices.mockResolvedValueOnce([]);

      const response = await GET(makeRequest());
      const body = await response.json();

      expect(body.framework).toBe("bookstaber");
    });

    it("includes framework=yardeni in response when requested", async () => {
      mockQueryLatestPrices.mockResolvedValueOnce([]);

      const response = await GET(makeRequest({ framework: "yardeni" }));
      const body = await response.json();

      expect(body.framework).toBe("yardeni");
    });

    it("uses yardeni domain weights when framework=yardeni", async () => {
      mockQueryLatestPrices.mockResolvedValueOnce([
        {
          time: "2026-03-20T10:00:00Z",
          ticker: "YARDENI_SCORE_PRIVATE_CREDIT",
          value: 50,
          source: "computed",
        },
        {
          time: "2026-03-20T10:00:00Z",
          ticker: "YARDENI_SCORE_AI_CONCENTRATION",
          value: 50,
          source: "computed",
        },
        {
          time: "2026-03-20T10:00:00Z",
          ticker: "YARDENI_SCORE_ENERGY_GEO",
          value: 50,
          source: "computed",
        },
        {
          time: "2026-03-20T10:00:00Z",
          ticker: "YARDENI_SCORE_CONTAGION",
          value: 50,
          source: "computed",
        },
        {
          time: "2026-03-20T10:00:00Z",
          ticker: "YARDENI_SCORE_COMPOSITE",
          value: 50,
          source: "computed",
        },
      ]);

      const response = await GET(makeRequest({ framework: "yardeni" }));
      const body = await response.json();

      expect(body.domains.private_credit.weight).toBe(0.25);
      expect(body.domains.ai_concentration.weight).toBe(0.2);
      expect(body.domains.energy_geo.weight).toBe(0.3);
      expect(body.domains.contagion.weight).toBe(0.25);
    });

    it("uses yardeni threat bands when framework=yardeni", async () => {
      mockQueryLatestPrices.mockResolvedValueOnce([
        {
          time: "2026-03-20T10:00:00Z",
          ticker: "YARDENI_SCORE_PRIVATE_CREDIT",
          value: 30,
          source: "computed",
        },
        {
          time: "2026-03-20T10:00:00Z",
          ticker: "YARDENI_SCORE_COMPOSITE",
          value: 30,
          source: "computed",
        },
      ]);

      const response = await GET(makeRequest({ framework: "yardeni" }));
      const body = await response.json();

      // Score 30 is LOW under yardeni (0-30) but ELEVATED under bookstaber (26-50)
      expect(body.domains.private_credit.level).toBe("LOW");
      expect(body.composite.level).toBe("LOW");
    });

    it("uses bookstaber threat bands for score 30 without framework param", async () => {
      mockQueryLatestPrices.mockResolvedValueOnce([
        {
          time: "2026-03-20T10:00:00Z",
          ticker: "SCORE_PRIVATE_CREDIT",
          value: 30,
          source: "computed",
        },
        {
          time: "2026-03-20T10:00:00Z",
          ticker: "SCORE_COMPOSITE",
          value: 30,
          source: "computed",
        },
      ]);

      const response = await GET(makeRequest());
      const body = await response.json();

      // Score 30 is ELEVATED under bookstaber (26-50)
      expect(body.domains.private_credit.level).toBe("ELEVATED");
      expect(body.composite.level).toBe("ELEVATED");
    });
  });
});
