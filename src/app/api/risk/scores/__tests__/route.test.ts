import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryLatestPrices } = vi.hoisted(() => {
  const mockQueryLatestPrices = vi.fn();
  return { mockQueryLatestPrices };
});

vi.mock("@/lib/timescaledb", () => ({
  queryLatestPrices: mockQueryLatestPrices,
}));

import { GET } from "@/app/api/risk/scores/route";

function makeRequest(): Request {
  return new Request("http://localhost:3000/api/risk/scores");
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
});
