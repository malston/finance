import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuerySourceHealth } = vi.hoisted(() => {
  const mockQuerySourceHealth = vi.fn();
  return { mockQuerySourceHealth };
});

vi.mock("@/lib/timescaledb", () => ({
  querySourceHealth: mockQuerySourceHealth,
}));

import { GET } from "@/app/api/risk/health/route";

describe("GET /api/risk/health", () => {
  beforeEach(() => {
    mockQuerySourceHealth.mockReset();
  });

  it("returns health status for all sources", async () => {
    const now = new Date();
    const recentSuccess = new Date(now.getTime() - 5 * 60 * 1000); // 5 min ago
    mockQuerySourceHealth.mockResolvedValueOnce([
      {
        source: "finnhub",
        last_success: recentSuccess.toISOString(),
        last_error: null,
        last_error_msg: null,
        consecutive_failures: 0,
      },
      {
        source: "fred",
        last_success: recentSuccess.toISOString(),
        last_error: null,
        last_error_msg: null,
        consecutive_failures: 0,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sources).toHaveLength(2);
  });

  it("computes staleness based on per-source thresholds", async () => {
    const now = new Date();
    // Finnhub: 20 min ago (>15m threshold -> stale)
    const finnhubSuccess = new Date(now.getTime() - 20 * 60 * 1000);
    // FRED: 20 min ago (<24h threshold -> not stale)
    const fredSuccess = new Date(now.getTime() - 20 * 60 * 1000);

    mockQuerySourceHealth.mockResolvedValueOnce([
      {
        source: "finnhub",
        last_success: finnhubSuccess.toISOString(),
        last_error: null,
        last_error_msg: null,
        consecutive_failures: 0,
      },
      {
        source: "fred",
        last_success: fredSuccess.toISOString(),
        last_error: null,
        last_error_msg: null,
        consecutive_failures: 0,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    const finnhub = body.sources.find(
      (s: { source: string }) => s.source === "finnhub",
    );
    const fred = body.sources.find(
      (s: { source: string }) => s.source === "fred",
    );

    expect(finnhub.stale).toBe(true);
    expect(finnhub.staleness_threshold).toBe("15m");
    expect(fred.stale).toBe(false);
    expect(fred.staleness_threshold).toBe("24h");
  });

  it("marks source as stale when last_success is null", async () => {
    mockQuerySourceHealth.mockResolvedValueOnce([
      {
        source: "finnhub",
        last_success: null,
        last_error: new Date().toISOString(),
        last_error_msg: "never succeeded",
        consecutive_failures: 5,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    const finnhub = body.sources.find(
      (s: { source: string }) => s.source === "finnhub",
    );
    expect(finnhub.stale).toBe(true);
    expect(finnhub.consecutive_failures).toBe(5);
  });

  it("includes consecutive_failures in response", async () => {
    mockQuerySourceHealth.mockResolvedValueOnce([
      {
        source: "finnhub",
        last_success: new Date().toISOString(),
        last_error: new Date().toISOString(),
        last_error_msg: "timeout",
        consecutive_failures: 3,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body.sources[0].consecutive_failures).toBe(3);
  });

  it("returns 500 on database error", async () => {
    mockQuerySourceHealth.mockRejectedValueOnce(
      new Error("connection refused"),
    );

    const response = await GET();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  it("defaults unknown sources to stale (conservative)", async () => {
    const now = new Date();
    const recentSuccess = new Date(now.getTime() - 5 * 60 * 1000);
    mockQuerySourceHealth.mockResolvedValueOnce([
      {
        source: "unknown_source",
        last_success: recentSuccess.toISOString(),
        last_error: null,
        last_error_msg: null,
        consecutive_failures: 0,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    const unknown = body.sources.find(
      (s: { source: string }) => s.source === "unknown_source",
    );
    expect(unknown.stale).toBe(true);
    expect(unknown.staleness_threshold).toBe("unknown");
  });

  it("returns empty sources array when no health data exists", async () => {
    mockQuerySourceHealth.mockResolvedValueOnce([]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sources).toEqual([]);
  });
});
