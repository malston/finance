import { describe, it, expect } from "vitest";
import {
  sentimentBgColor,
  sentimentTextColor,
  sentimentLabel,
  formatRelativeTime,
  DOMAINS,
} from "@/lib/sentiment";

describe("sentimentBgColor", () => {
  it("returns green for positive sentiment (> 0.2)", () => {
    expect(sentimentBgColor(0.5)).toBe("#22c55e");
    expect(sentimentBgColor(0.21)).toBe("#22c55e");
    expect(sentimentBgColor(1.0)).toBe("#22c55e");
  });

  it("returns yellow for neutral sentiment (-0.2 to 0.2)", () => {
    expect(sentimentBgColor(0.0)).toBe("#eab308");
    expect(sentimentBgColor(0.2)).toBe("#eab308");
    expect(sentimentBgColor(-0.2)).toBe("#eab308");
    expect(sentimentBgColor(0.1)).toBe("#eab308");
  });

  it("returns red for negative sentiment (< -0.2)", () => {
    expect(sentimentBgColor(-0.5)).toBe("#ef4444");
    expect(sentimentBgColor(-0.21)).toBe("#ef4444");
    expect(sentimentBgColor(-1.0)).toBe("#ef4444");
  });
});

describe("sentimentTextColor", () => {
  it("returns light green text for positive sentiment", () => {
    expect(sentimentTextColor(0.5)).toBe("#dcfce7");
  });

  it("returns light yellow text for neutral sentiment", () => {
    expect(sentimentTextColor(0.0)).toBe("#fef9c3");
  });

  it("returns light red text for negative sentiment", () => {
    expect(sentimentTextColor(-0.5)).toBe("#fecaca");
  });
});

describe("sentimentLabel", () => {
  it("returns formatted score with sign", () => {
    expect(sentimentLabel(0.65)).toBe("+0.65");
    expect(sentimentLabel(-0.45)).toBe("-0.45");
    expect(sentimentLabel(0.0)).toBe("0.00");
  });
});

describe("formatRelativeTime", () => {
  it("formats seconds ago", () => {
    const now = new Date();
    const thirtySecondsAgo = new Date(now.getTime() - 30 * 1000);
    expect(formatRelativeTime(thirtySecondsAgo.toISOString())).toBe("just now");
  });

  it("formats minutes ago", () => {
    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinutesAgo.toISOString())).toBe("5m ago");
  });

  it("formats hours ago", () => {
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    expect(formatRelativeTime(twoHoursAgo.toISOString())).toBe("2h ago");
  });

  it("formats days ago", () => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    expect(formatRelativeTime(threeDaysAgo.toISOString())).toBe("3d ago");
  });

  it("formats 1 minute ago", () => {
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);
    expect(formatRelativeTime(oneMinuteAgo.toISOString())).toBe("1m ago");
  });
});

describe("DOMAINS", () => {
  it("has four domain entries", () => {
    expect(DOMAINS).toHaveLength(4);
  });

  it("contains the expected domains", () => {
    const keys = DOMAINS.map((d) => d.key);
    expect(keys).toEqual([
      "private_credit",
      "ai_tech",
      "energy_geo",
      "geopolitical",
    ]);
  });

  it("maps each domain to a sentiment ticker", () => {
    const tickers = DOMAINS.map((d) => d.ticker);
    expect(tickers).toEqual([
      "SENTIMENT_PRIVATE_CREDIT",
      "SENTIMENT_AI_TECH",
      "SENTIMENT_ENERGY_GEO",
      "SENTIMENT_GEOPOLITICAL",
    ]);
  });

  it("has display labels for each domain", () => {
    const labels = DOMAINS.map((d) => d.label);
    expect(labels).toEqual([
      "Private Credit",
      "AI / Tech",
      "Energy / Geo",
      "Geopolitical",
    ]);
  });
});
