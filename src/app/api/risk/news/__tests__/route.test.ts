import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockQueryNewsSentiment } = vi.hoisted(() => {
  const mockQueryNewsSentiment = vi.fn();
  return { mockQueryNewsSentiment };
});

vi.mock("@/lib/timescaledb", () => ({
  queryNewsSentiment: mockQueryNewsSentiment,
}));

import { GET } from "../route";

const SAMPLE_NEWS = [
  {
    time: "2026-03-20T15:00:00Z",
    domain: "private_credit",
    headline: "BDC defaults spike amid market stress",
    sentiment: -0.45,
    source_name: "reuters.com",
    source_url: "https://reuters.com/article/bdc-defaults",
  },
  {
    time: "2026-03-20T14:30:00Z",
    domain: "private_credit",
    headline: "CLO market faces headwinds",
    sentiment: -0.3,
    source_name: "bloomberg.com",
    source_url: "https://bloomberg.com/news/clo",
  },
];

describe("GET /api/risk/news", () => {
  beforeEach(() => {
    mockQueryNewsSentiment.mockReset();
  });

  it("returns news for a valid domain", async () => {
    mockQueryNewsSentiment.mockResolvedValueOnce(SAMPLE_NEWS);
    const request = new Request(
      "http://localhost/api/risk/news?domain=private_credit",
    );
    const response = await GET(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toHaveLength(2);
    expect(body[0].headline).toBe("BDC defaults spike amid market stress");
  });

  it("returns 400 when domain is missing", async () => {
    const request = new Request("http://localhost/api/risk/news");
    const response = await GET(request);
    expect(response.status).toBe(400);
  });

  it("passes limit parameter to query", async () => {
    mockQueryNewsSentiment.mockResolvedValueOnce([]);
    const request = new Request(
      "http://localhost/api/risk/news?domain=ai_tech&limit=5",
    );
    await GET(request);
    expect(mockQueryNewsSentiment).toHaveBeenCalledWith("ai_tech", 5);
  });

  it("defaults limit to 10", async () => {
    mockQueryNewsSentiment.mockResolvedValueOnce([]);
    const request = new Request(
      "http://localhost/api/risk/news?domain=ai_tech",
    );
    await GET(request);
    expect(mockQueryNewsSentiment).toHaveBeenCalledWith("ai_tech", 10);
  });

  it("returns 500 on database error", async () => {
    mockQueryNewsSentiment.mockRejectedValueOnce(
      new Error("connection refused"),
    );
    const request = new Request(
      "http://localhost/api/risk/news?domain=private_credit",
    );
    const response = await GET(request);
    expect(response.status).toBe(500);
  });

  it("returns empty array when no news found", async () => {
    mockQueryNewsSentiment.mockResolvedValueOnce([]);
    const request = new Request(
      "http://localhost/api/risk/news?domain=geopolitical",
    );
    const response = await GET(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toEqual([]);
  });
});
