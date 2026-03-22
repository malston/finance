import { describe, it, expect } from "vitest";
import { JARGON_DEFINITIONS } from "@/lib/jargon";

describe("JARGON_DEFINITIONS", () => {
  it("contains at least 7 terms", () => {
    const keys = Object.keys(JARGON_DEFINITIONS);
    expect(keys.length).toBeGreaterThanOrEqual(7);
  });

  it("includes Pearson Correlation", () => {
    expect(JARGON_DEFINITIONS["Pearson Correlation"]).toBeDefined();
    expect(JARGON_DEFINITIONS["Pearson Correlation"]).toContain("statistical");
  });

  it("includes HY Credit Spread", () => {
    expect(JARGON_DEFINITIONS["HY Credit Spread"]).toBeDefined();
    expect(JARGON_DEFINITIONS["HY Credit Spread"]).toContain("yield");
  });

  it("includes BDC", () => {
    expect(JARGON_DEFINITIONS["BDC"]).toBeDefined();
    expect(JARGON_DEFINITIONS["BDC"]).toContain("Business Development Company");
  });

  it("includes VIX", () => {
    expect(JARGON_DEFINITIONS["VIX"]).toBeDefined();
    expect(JARGON_DEFINITIONS["VIX"]).toContain("volatility");
  });

  it("includes MOVE", () => {
    expect(JARGON_DEFINITIONS["MOVE"]).toBeDefined();
    expect(JARGON_DEFINITIONS["MOVE"]).toContain("bond");
  });

  it("includes SPY/RSP Ratio", () => {
    expect(JARGON_DEFINITIONS["SPY/RSP Ratio"]).toBeDefined();
    expect(JARGON_DEFINITIONS["SPY/RSP Ratio"]).toContain("equal-weighted");
  });

  it("includes Contagion", () => {
    expect(JARGON_DEFINITIONS["Contagion"]).toBeDefined();
    expect(JARGON_DEFINITIONS["Contagion"]).toContain("stress");
  });

  it("every definition is a non-empty string", () => {
    for (const [key, value] of Object.entries(JARGON_DEFINITIONS)) {
      expect(typeof value).toBe("string");
      expect(value.length).toBeGreaterThan(0);
    }
  });
});
