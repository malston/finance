import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQuery } = vi.hoisted(() => {
  const mockQuery = vi.fn();
  return { mockQuery };
});

vi.mock("pg", () => ({
  Pool: class MockPool {
    query = mockQuery;
  },
}));

import { queryTimeSeries, type TimeSeriesRow } from "@/lib/timescaledb";

describe("queryTimeSeries", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns rows for a valid ticker and days", async () => {
    const fakeRows: TimeSeriesRow[] = [
      {
        time: "2026-01-15T00:00:00Z",
        ticker: "BAMLH0A0HYM2",
        value: 380.5,
        source: "fred",
      },
      {
        time: "2026-01-16T00:00:00Z",
        ticker: "BAMLH0A0HYM2",
        value: 382.0,
        source: "fred",
      },
    ];
    mockQuery.mockResolvedValueOnce({ rows: fakeRows });

    const result = await queryTimeSeries("BAMLH0A0HYM2", 79);

    expect(result).toEqual(fakeRows);
    expect(result).toHaveLength(2);
  });

  it("passes ticker and days as query parameters", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await queryTimeSeries("BAMLH0A0HYM2", 79);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("ticker");
    expect(params).toContain("BAMLH0A0HYM2");
    expect(params).toContain(79);
  });

  it("orders results by time ascending", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await queryTimeSeries("BAMLH0A0HYM2", 30);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY.*time.*ASC/i);
  });

  it("defaults days to 79 when not specified", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await queryTimeSeries("BAMLH0A0HYM2");

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain(79);
  });

  it("throws on empty ticker", async () => {
    await expect(queryTimeSeries("", 79)).rejects.toThrow("ticker is required");
  });

  it("clamps days to minimum of 1", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await queryTimeSeries("BAMLH0A0HYM2", 0);

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain(1);
  });

  it("returns empty array when no data found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await queryTimeSeries("NONEXISTENT", 30);

    expect(result).toEqual([]);
  });
});
