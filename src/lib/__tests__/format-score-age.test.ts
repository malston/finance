import { describe, it, expect, vi, afterEach } from "vitest";
import {
  isScoreAged,
  formatScoreTimestamp,
  STALENESS_THRESHOLD_MS,
} from "@/lib/format-score-age";

describe("STALENESS_THRESHOLD_MS", () => {
  it("equals 30 minutes in milliseconds", () => {
    expect(STALENESS_THRESHOLD_MS).toBe(30 * 60 * 1000);
  });
});

describe("isScoreAged", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns false when updatedAt is null", () => {
    expect(isScoreAged(null)).toBe(false);
  });

  it("returns false when updatedAt is in the future", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-20T20:00:00Z"));
    expect(isScoreAged("2026-03-20T21:00:00Z")).toBe(false);
  });

  it("returns false when updatedAt is 5 minutes ago (fresh)", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-20T20:00:00Z");
    vi.setSystemTime(now);
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    expect(isScoreAged(fiveMinAgo)).toBe(false);
  });

  it("returns false when updatedAt is 29 minutes 59 seconds ago", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-20T20:00:00Z");
    vi.setSystemTime(now);
    const justUnder = new Date(
      now.getTime() - (30 * 60 * 1000 - 1000),
    ).toISOString();
    expect(isScoreAged(justUnder)).toBe(false);
  });

  it("returns true when updatedAt is exactly 30 minutes ago", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-20T20:00:00Z");
    vi.setSystemTime(now);
    const exactly30 = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    expect(isScoreAged(exactly30)).toBe(true);
  });

  it("returns true when updatedAt is 2 hours ago", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-20T20:00:00Z");
    vi.setSystemTime(now);
    const twoHoursAgo = new Date(
      now.getTime() - 2 * 60 * 60 * 1000,
    ).toISOString();
    expect(isScoreAged(twoHoursAgo)).toBe(true);
  });

  it("accepts a custom thresholdMs parameter", () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-20T20:00:00Z");
    vi.setSystemTime(now);
    const fifteenMinAgo = new Date(
      now.getTime() - 15 * 60 * 1000,
    ).toISOString();
    // 15 min ago is NOT aged with default 30-min threshold
    expect(isScoreAged(fifteenMinAgo)).toBe(false);
    // 15 min ago IS aged with 10-min threshold
    expect(isScoreAged(fifteenMinAgo, 10 * 60 * 1000)).toBe(true);
  });

  it("returns false for empty string", () => {
    expect(isScoreAged("")).toBe(false);
  });

  it("returns false for malformed date string", () => {
    expect(isScoreAged("not-a-date")).toBe(false);
  });
});

describe("formatScoreTimestamp", () => {
  it("formats a known timestamp in ET with expected pattern", () => {
    // 2026-03-20T20:00:00Z = Fri Mar 20 at 4:00 PM ET (EDT, UTC-4)
    const result = formatScoreTimestamp("2026-03-20T20:00:00Z");
    expect(result).toContain("Fri");
    expect(result).toContain("Mar");
    expect(result).toContain("20");
    expect(result).toContain("4:00");
    expect(result).toContain("PM");
    expect(result).toContain("ET");
  });

  it("includes the 'as of' prefix", () => {
    const result = formatScoreTimestamp("2026-03-20T20:00:00Z");
    expect(result).toMatch(/^as of /);
  });

  it("uses Eastern Time regardless of input timezone offset", () => {
    // Same instant expressed with explicit offset -- should produce same ET output
    const resultZ = formatScoreTimestamp("2026-03-20T20:00:00Z");
    const resultOffset = formatScoreTimestamp("2026-03-20T16:00:00-04:00");
    expect(resultZ).toBe(resultOffset);
  });

  it("ends with ET", () => {
    const result = formatScoreTimestamp("2026-01-15T18:30:00Z");
    expect(result).toMatch(/ ET$/);
  });

  it("contains AM/PM indicator", () => {
    // 2026-01-15T18:30:00Z = 1:30 PM ET (EST, UTC-5 in January)
    const result = formatScoreTimestamp("2026-01-15T18:30:00Z");
    expect(result).toContain("PM");
  });

  it("returns null for malformed date string", () => {
    expect(formatScoreTimestamp("not-a-date")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(formatScoreTimestamp("")).toBeNull();
  });
});
