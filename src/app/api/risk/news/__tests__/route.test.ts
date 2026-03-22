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
    expect(body.items).toHaveLength(2);
    expect(body.items[0].headline).toBe(
      "BDC defaults spike amid market stress",
    );
    expect(body.framework).toBe("bookstaber");
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
    expect(body.items).toEqual([]);
    expect(body.framework).toBe("bookstaber");
  });

  describe("framework parameter", () => {
    const MIXED_SENTIMENT_NEWS = [
      {
        time: "2026-03-20T15:00:00Z",
        domain: "private_credit",
        headline: "BDC defaults spike",
        sentiment: -0.45,
        source_name: "reuters.com",
        source_url: "https://reuters.com/article/bdc",
      },
      {
        time: "2026-03-20T14:30:00Z",
        domain: "private_credit",
        headline: "Private lending resilient",
        sentiment: 0.6,
        source_name: "bloomberg.com",
        source_url: "https://bloomberg.com/news/lending",
      },
      {
        time: "2026-03-20T14:00:00Z",
        domain: "private_credit",
        headline: "CLO markets stable",
        sentiment: 0.1,
        source_name: "ft.com",
        source_url: "https://ft.com/clo",
      },
    ];

    it("sorts news by sentiment ascending (most negative first) for bookstaber", async () => {
      mockQueryNewsSentiment.mockResolvedValueOnce([...MIXED_SENTIMENT_NEWS]);

      const request = new Request(
        "http://localhost/api/risk/news?domain=private_credit&framework=bookstaber",
      );
      const response = await GET(request);
      const body = await response.json();

      expect(body.items[0].sentiment).toBe(-0.45);
      expect(body.items[1].sentiment).toBe(0.1);
      expect(body.items[2].sentiment).toBe(0.6);
      expect(body.framework).toBe("bookstaber");
    });

    it("sorts news by sentiment descending (most positive first) for yardeni", async () => {
      mockQueryNewsSentiment.mockResolvedValueOnce([...MIXED_SENTIMENT_NEWS]);

      const request = new Request(
        "http://localhost/api/risk/news?domain=private_credit&framework=yardeni",
      );
      const response = await GET(request);
      const body = await response.json();

      expect(body.items[0].sentiment).toBe(0.6);
      expect(body.items[1].sentiment).toBe(0.1);
      expect(body.items[2].sentiment).toBe(-0.45);
      expect(body.framework).toBe("yardeni");
    });

    it("defaults to bookstaber sort (ascending) when no framework specified", async () => {
      mockQueryNewsSentiment.mockResolvedValueOnce([...MIXED_SENTIMENT_NEWS]);

      const request = new Request(
        "http://localhost/api/risk/news?domain=private_credit",
      );
      const response = await GET(request);
      const body = await response.json();

      expect(body.items[0].sentiment).toBe(-0.45);
      expect(body.items[2].sentiment).toBe(0.6);
      expect(body.framework).toBe("bookstaber");
    });

    it("defaults to bookstaber for invalid framework value", async () => {
      mockQueryNewsSentiment.mockResolvedValueOnce([...MIXED_SENTIMENT_NEWS]);

      const request = new Request(
        "http://localhost/api/risk/news?domain=private_credit&framework=invalid",
      );
      const response = await GET(request);
      const body = await response.json();

      // Ascending sort (bookstaber default)
      expect(body.items[0].sentiment).toBe(-0.45);
      expect(body.items[2].sentiment).toBe(0.6);
      expect(body.framework).toBe("bookstaber");
    });

    it("returns empty items regardless of framework when no news", async () => {
      mockQueryNewsSentiment.mockResolvedValueOnce([]);

      const request = new Request(
        "http://localhost/api/risk/news?domain=private_credit&framework=yardeni",
      );
      const response = await GET(request);
      const body = await response.json();

      expect(body.items).toEqual([]);
      expect(body.framework).toBe("yardeni");
    });
  });
});
