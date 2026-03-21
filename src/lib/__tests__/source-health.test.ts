import { describe, it, expect } from "vitest";
import {
  getSourceForTicker,
  SOURCE_TICKER_MAP,
  type SourceHealthResponse,
  type SourceStatus,
} from "@/lib/source-health";

describe("SOURCE_TICKER_MAP", () => {
  it("maps finnhub to all expected equity/ETF tickers", () => {
    const finnhubTickers = SOURCE_TICKER_MAP.finnhub;
    expect(finnhubTickers).toContain("OWL");
    expect(finnhubTickers).toContain("ARCC");
    expect(finnhubTickers).toContain("BXSL");
    expect(finnhubTickers).toContain("OBDC");
    expect(finnhubTickers).toContain("NVDA");
    expect(finnhubTickers).toContain("MSFT");
    expect(finnhubTickers).toContain("GOOGL");
    expect(finnhubTickers).toContain("META");
    expect(finnhubTickers).toContain("AMZN");
    expect(finnhubTickers).toContain("SMH");
    expect(finnhubTickers).toContain("SPY");
    expect(finnhubTickers).toContain("RSP");
    expect(finnhubTickers).toContain("HYG");
    expect(finnhubTickers).toContain("XLU");
    expect(finnhubTickers).toContain("EWT");
    expect(finnhubTickers).toContain("VIX");
    expect(finnhubTickers).toContain("MOVE");
    expect(finnhubTickers).toContain("SKEW");
    expect(finnhubTickers).toContain("CL=F");
    expect(finnhubTickers).toContain("NG=F");
  });

  it("maps fred to FRED series tickers", () => {
    const fredTickers = SOURCE_TICKER_MAP.fred;
    expect(fredTickers).toContain("BAMLH0A0HYM2");
    expect(fredTickers).toContain("DGS10");
    expect(fredTickers).toContain("DGS2");
    expect(fredTickers).toContain("T10Y2Y");
  });

  it("maps valyu to non-price data types", () => {
    const valyuTickers = SOURCE_TICKER_MAP.valyu;
    expect(valyuTickers).toContain("news_sentiment");
    expect(valyuTickers).toContain("sec_filings");
    expect(valyuTickers).toContain("insider_trades");
  });

  it("does not map valyu to any price tickers", () => {
    const valyuTickers = SOURCE_TICKER_MAP.valyu;
    expect(valyuTickers).not.toContain("NVDA");
    expect(valyuTickers).not.toContain("DGS10");
  });
});

describe("getSourceForTicker", () => {
  it("returns finnhub for NVDA", () => {
    expect(getSourceForTicker("NVDA")).toBe("finnhub");
  });

  it("returns finnhub for CL=F", () => {
    expect(getSourceForTicker("CL=F")).toBe("finnhub");
  });

  it("returns fred for BAMLH0A0HYM2", () => {
    expect(getSourceForTicker("BAMLH0A0HYM2")).toBe("fred");
  });

  it("returns fred for DGS10", () => {
    expect(getSourceForTicker("DGS10")).toBe("fred");
  });

  it("returns valyu for news_sentiment", () => {
    expect(getSourceForTicker("news_sentiment")).toBe("valyu");
  });

  it("returns null for unknown tickers", () => {
    expect(getSourceForTicker("UNKNOWN_TICKER")).toBeNull();
  });

  it("returns null for synthetic tickers like SPY_RSP_RATIO", () => {
    expect(getSourceForTicker("SPY_RSP_RATIO")).toBeNull();
  });

  it("returns null for CORR (computed, not from a source)", () => {
    expect(getSourceForTicker("CORR")).toBeNull();
  });
});

describe("SourceHealthResponse type", () => {
  it("matches the expected API shape", () => {
    const response: SourceHealthResponse = {
      sources: [
        {
          source: "fred",
          last_success: "2026-03-20T15:00:00Z",
          stale: false,
          staleness_threshold: "24h",
          consecutive_failures: 0,
        },
        {
          source: "finnhub",
          last_success: null,
          stale: true,
          staleness_threshold: "15m",
          consecutive_failures: 3,
        },
      ],
    };

    expect(response.sources).toHaveLength(2);
    expect(response.sources[0].source).toBe("fred");
    expect(response.sources[1].stale).toBe(true);
  });
});
