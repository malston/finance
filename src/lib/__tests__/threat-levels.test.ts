import { describe, it, expect } from "vitest";

import { getThreatLevel } from "@/lib/threat-levels";

describe("getThreatLevel", () => {
  it("returns LOW for score 0", () => {
    const result = getThreatLevel(0);
    expect(result).toEqual({ level: "LOW", color: "#22c55e" });
  });

  it("returns LOW for score 25", () => {
    const result = getThreatLevel(25);
    expect(result).toEqual({ level: "LOW", color: "#22c55e" });
  });

  it("returns ELEVATED for score 26", () => {
    const result = getThreatLevel(26);
    expect(result).toEqual({ level: "ELEVATED", color: "#eab308" });
  });

  it("returns ELEVATED for score 50", () => {
    const result = getThreatLevel(50);
    expect(result).toEqual({ level: "ELEVATED", color: "#eab308" });
  });

  it("returns HIGH for score 51", () => {
    const result = getThreatLevel(51);
    expect(result).toEqual({ level: "HIGH", color: "#f97316" });
  });

  it("returns HIGH for score 75", () => {
    const result = getThreatLevel(75);
    expect(result).toEqual({ level: "HIGH", color: "#f97316" });
  });

  it("returns CRITICAL for score 76", () => {
    const result = getThreatLevel(76);
    expect(result).toEqual({ level: "CRITICAL", color: "#ef4444" });
  });

  it("returns CRITICAL for score 100", () => {
    const result = getThreatLevel(100);
    expect(result).toEqual({ level: "CRITICAL", color: "#ef4444" });
  });

  it("handles fractional score 25.5 as ELEVATED", () => {
    const result = getThreatLevel(25.5);
    expect(result.level).toBe("ELEVATED");
  });

  it("handles fractional score 50.5 as HIGH", () => {
    const result = getThreatLevel(50.5);
    expect(result.level).toBe("HIGH");
  });

  it("handles fractional score 75.5 as CRITICAL", () => {
    const result = getThreatLevel(75.5);
    expect(result.level).toBe("CRITICAL");
  });
});
