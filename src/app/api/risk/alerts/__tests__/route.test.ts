import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  return { mockQuery };
});

vi.mock("@/lib/timescaledb", () => ({
  query: mockQuery,
}));

import { GET, POST } from "@/app/api/risk/alerts/route";

function makeGetRequest(limit?: number): Request {
  const url = limit
    ? `http://localhost:3000/api/risk/alerts?limit=${limit}`
    : "http://localhost:3000/api/risk/alerts";
  return new Request(url);
}

function makePostRequest(body: unknown): Request {
  return new Request("http://localhost:3000/api/risk/alerts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("GET /api/risk/alerts", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns alerts array with correct fields", async () => {
    mockQuery.mockResolvedValueOnce([
      {
        id: 1,
        rule_id: "composite_critical",
        triggered_at: "2026-03-20T10:00:00Z",
        value: 80.5,
        message: "Composite threat CRITICAL",
        channels: ["email", "slack"],
        delivered: false,
      },
    ]);

    const response = await GET(makeGetRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alerts).toHaveLength(1);
    expect(body.alerts[0]).toMatchObject({
      id: 1,
      rule_id: "composite_critical",
      triggered_at: "2026-03-20T10:00:00Z",
      value: 80.5,
      message: "Composite threat CRITICAL",
      channels: ["email", "slack"],
      delivered: false,
    });
  });

  it("respects limit parameter", async () => {
    mockQuery.mockResolvedValueOnce([]);

    await GET(makeGetRequest(10));

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("LIMIT"),
      [10],
    );
  });

  it("clamps limit to 1-200", async () => {
    mockQuery.mockResolvedValueOnce([]);
    await GET(makeGetRequest(-5));
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [1]);

    mockQuery.mockReset();
    mockQuery.mockResolvedValueOnce([]);
    await GET(makeGetRequest(500));
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [200]);
  });

  it("returns 500 on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const response = await GET(makeGetRequest());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});

describe("POST /api/risk/alerts", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("acknowledges alert (updates delivered to true)", async () => {
    mockQuery.mockResolvedValueOnce([
      { id: 1, rule_id: "composite_critical", delivered: true },
    ]);

    const response = await POST(makePostRequest({ id: 1 }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.alert.delivered).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE"),
      [1],
    );
  });

  it("returns 400 for non-integer ID", async () => {
    const response = await POST(makePostRequest({ id: "abc" }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toContain("integer");
  });

  it("returns 404 for unknown alert ID", async () => {
    mockQuery.mockResolvedValueOnce([]);

    const response = await POST(makePostRequest({ id: 999999 }));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toContain("not found");
  });

  it("returns 500 on DB error", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const response = await POST(makePostRequest({ id: 1 }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });
});
