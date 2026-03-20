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

import {
  query,
  queryTimeSeries,
  queryNewsSentiment,
  type TimeSeriesRow,
  type NewsSentimentRow,
} from "@/lib/timescaledb";

describe("query", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("executes SQL with params and returns rows", async () => {
    const fakeRows = [{ id: 1, name: "test" }];
    mockQuery.mockResolvedValueOnce({ rows: fakeRows });

    const result = await query("SELECT * FROM things WHERE id = $1", [1]);

    expect(result).toEqual(fakeRows);
    expect(mockQuery).toHaveBeenCalledWith(
      "SELECT * FROM things WHERE id = $1",
      [1],
    );
  });

  it("returns empty array when no rows match", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await query("SELECT * FROM things WHERE id = $1", [999]);

    expect(result).toEqual([]);
  });

  it("propagates database errors", async () => {
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    await expect(query("SELECT 1", [])).rejects.toThrow("connection refused");
  });
});

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

describe("queryNewsSentiment", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns rows for a valid domain", async () => {
    const fakeRows: NewsSentimentRow[] = [
      {
        time: "2026-03-20T15:00:00Z",
        domain: "private_credit",
        headline: "BDC defaults spike",
        sentiment: -0.45,
        source_name: "reuters.com",
        source_url: "https://reuters.com/article/1",
      },
    ];
    mockQuery.mockResolvedValueOnce({ rows: fakeRows });

    const result = await queryNewsSentiment("private_credit", 10);

    expect(result).toEqual(fakeRows);
    expect(result).toHaveLength(1);
  });

  it("passes domain and limit as query parameters", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await queryNewsSentiment("ai_tech", 5);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("news_sentiment");
    expect(params).toContain("ai_tech");
    expect(params).toContain(5);
  });

  it("orders results by time descending", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await queryNewsSentiment("private_credit", 10);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/ORDER BY.*time.*DESC/i);
  });

  it("defaults limit to 10", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await queryNewsSentiment("private_credit");

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain(10);
  });

  it("throws on empty domain", async () => {
    await expect(queryNewsSentiment("")).rejects.toThrow("domain is required");
  });

  it("clamps limit to range [1, 100]", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await queryNewsSentiment("ai_tech", 0);

    const [, params] = mockQuery.mock.calls[0];
    expect(params).toContain(1);
  });

  it("returns empty array when no data found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const result = await queryNewsSentiment("geopolitical", 10);

    expect(result).toEqual([]);
  });
});
