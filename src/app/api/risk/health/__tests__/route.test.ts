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
    const now = new Date().toISOString();
    mockQuerySourceHealth.mockResolvedValueOnce([
      {
        source: "finnhub",
        last_success: now,
        last_error: null,
        last_error_msg: null,
        consecutive_failures: 0,
      },
      {
        source: "fred",
        last_success: now,
        last_error: null,
        last_error_msg: null,
        consecutive_failures: 0,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.sources).toHaveLength(2);
    expect(body.sources[0].source).toBe("finnhub");
    expect(body.sources[0]).toHaveProperty("stale");
    expect(body.sources[0]).toHaveProperty("staleness_threshold");
    expect(body.sources[0]).toHaveProperty("consecutive_failures");
    expect(body.sources[0]).toHaveProperty("last_success");
  });

  it("marks finnhub as stale after 15 minutes", async () => {
    const staleTime = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    mockQuerySourceHealth.mockResolvedValueOnce([
      {
        source: "finnhub",
        last_success: staleTime,
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
    expect(finnhub.stale).toBe(true);
    expect(finnhub.staleness_threshold).toBe("15m");
  });

  it("marks fred as not stale within 24 hours", async () => {
    const freshTime = new Date(Date.now() - 23 * 60 * 60 * 1000).toISOString();
    mockQuerySourceHealth.mockResolvedValueOnce([
      {
        source: "fred",
        last_success: freshTime,
        last_error: null,
        last_error_msg: null,
        consecutive_failures: 0,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    const fred = body.sources.find(
      (s: { source: string }) => s.source === "fred",
    );
    expect(fred.stale).toBe(false);
    expect(fred.staleness_threshold).toBe("24h");
  });

  it("marks fred as stale after 24 hours", async () => {
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    mockQuerySourceHealth.mockResolvedValueOnce([
      {
        source: "fred",
        last_success: staleTime,
        last_error: null,
        last_error_msg: null,
        consecutive_failures: 0,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    const fred = body.sources.find(
      (s: { source: string }) => s.source === "fred",
    );
    expect(fred.stale).toBe(true);
  });

  it("includes consecutive_failures from the database", async () => {
    const now = new Date().toISOString();
    mockQuerySourceHealth.mockResolvedValueOnce([
      {
        source: "valyu_sentiment",
        last_success: now,
        last_error: now,
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

  it("returns staleness_threshold of 2h for valyu_sentiment", async () => {
    const now = new Date().toISOString();
    mockQuerySourceHealth.mockResolvedValueOnce([
      {
        source: "valyu_sentiment",
        last_success: now,
        last_error: null,
        last_error_msg: null,
        consecutive_failures: 0,
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(body.sources[0].staleness_threshold).toBe("2h");
  });

  it("sets JSON content type header", async () => {
    mockQuerySourceHealth.mockResolvedValueOnce([]);

    const response = await GET();

    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});
