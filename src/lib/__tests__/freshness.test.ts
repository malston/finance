import { describe, it, expect } from "vitest";
import {
  getFreshnessStatus,
  formatRelativeTime,
  type FreshnessStatus,
} from "@/lib/freshness";

describe("getFreshnessStatus", () => {
  describe("finnhub source (15min/1h thresholds)", () => {
    it("returns live when data is less than 15 minutes old", () => {
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const result = getFreshnessStatus(fiveMinAgo, "finnhub", now);
      expect(result).toBe("live");
    });

    it("returns stale when data is between 15 minutes and 1 hour old", () => {
      const now = new Date();
      const thirtyMinAgo = new Date(
        now.getTime() - 30 * 60 * 1000,
      ).toISOString();
      const result = getFreshnessStatus(thirtyMinAgo, "finnhub", now);
      expect(result).toBe("stale");
    });

    it("returns stale at exactly 15 minutes (boundary)", () => {
      const now = new Date();
      const exactly15Min = new Date(
        now.getTime() - 15 * 60 * 1000,
      ).toISOString();
      const result = getFreshnessStatus(exactly15Min, "finnhub", now);
      expect(result).toBe("stale");
    });

    it("returns offline when data is more than 1 hour old", () => {
      const now = new Date();
      const twoHoursAgo = new Date(
        now.getTime() - 2 * 60 * 60 * 1000,
      ).toISOString();
      const result = getFreshnessStatus(twoHoursAgo, "finnhub", now);
      expect(result).toBe("offline");
    });

    it("returns offline at exactly 1 hour (boundary)", () => {
      const now = new Date();
      const exactlyOneHour = new Date(
        now.getTime() - 60 * 60 * 1000,
      ).toISOString();
      const result = getFreshnessStatus(exactlyOneHour, "finnhub", now);
      expect(result).toBe("offline");
    });
  });

  describe("fred source (24h/48h thresholds)", () => {
    it("returns live when data is less than 24 hours old", () => {
      const now = new Date();
      const twelveHoursAgo = new Date(
        now.getTime() - 12 * 60 * 60 * 1000,
      ).toISOString();
      const result = getFreshnessStatus(twelveHoursAgo, "fred", now);
      expect(result).toBe("live");
    });

    it("returns stale when data is between 24 and 48 hours old", () => {
      const now = new Date();
      const thirtyHoursAgo = new Date(
        now.getTime() - 30 * 60 * 60 * 1000,
      ).toISOString();
      const result = getFreshnessStatus(thirtyHoursAgo, "fred", now);
      expect(result).toBe("stale");
    });

    it("returns offline when data is more than 48 hours old", () => {
      const now = new Date();
      const threeDaysAgo = new Date(
        now.getTime() - 72 * 60 * 60 * 1000,
      ).toISOString();
      const result = getFreshnessStatus(threeDaysAgo, "fred", now);
      expect(result).toBe("offline");
    });
  });

  describe("computed source (24h/48h thresholds, same as fred)", () => {
    it("returns live when data is less than 24 hours old", () => {
      const now = new Date();
      const sixHoursAgo = new Date(
        now.getTime() - 6 * 60 * 60 * 1000,
      ).toISOString();
      const result = getFreshnessStatus(sixHoursAgo, "computed", now);
      expect(result).toBe("live");
    });

    it("returns stale when data is between 24 and 48 hours old", () => {
      const now = new Date();
      const thirtyHoursAgo = new Date(
        now.getTime() - 30 * 60 * 60 * 1000,
      ).toISOString();
      const result = getFreshnessStatus(thirtyHoursAgo, "computed", now);
      expect(result).toBe("stale");
    });
  });

  describe("null/unknown source", () => {
    it("returns no-data when lastUpdated is null", () => {
      const result = getFreshnessStatus(null, "finnhub");
      expect(result).toBe("no-data");
    });

    it("uses finnhub thresholds for unknown sources", () => {
      const now = new Date();
      const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
      const result = getFreshnessStatus(fiveMinAgo, "unknown_source", now);
      expect(result).toBe("live");
    });
  });
});

describe("formatRelativeTime", () => {
  it("formats seconds ago", () => {
    const now = new Date();
    const thirtySecAgo = new Date(now.getTime() - 30 * 1000).toISOString();
    expect(formatRelativeTime(thirtySecAgo, now)).toBe("30s ago");
  });

  it("formats minutes ago", () => {
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinAgo, now)).toBe("5m ago");
  });

  it("formats hours ago", () => {
    const now = new Date();
    const threeHoursAgo = new Date(
      now.getTime() - 3 * 60 * 60 * 1000,
    ).toISOString();
    expect(formatRelativeTime(threeHoursAgo, now)).toBe("3h ago");
  });

  it("formats days ago", () => {
    const now = new Date();
    const twoDaysAgo = new Date(
      now.getTime() - 2 * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(formatRelativeTime(twoDaysAgo, now)).toBe("2d ago");
  });

  it("returns 'No data' for null", () => {
    expect(formatRelativeTime(null)).toBe("No data");
  });

  it("returns 'just now' for very recent timestamps", () => {
    const now = new Date();
    const justNow = new Date(now.getTime() - 2 * 1000).toISOString();
    expect(formatRelativeTime(justNow, now)).toBe("just now");
  });
});
