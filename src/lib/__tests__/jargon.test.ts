import { describe, it, expect } from "vitest";
import { JARGON_DEFINITIONS } from "@/lib/jargon";

describe("JARGON_DEFINITIONS", () => {
  it("contains at least 9 terms (7 original + 2 new)", () => {
    const keys = Object.keys(JARGON_DEFINITIONS);
    expect(keys.length).toBeGreaterThanOrEqual(9);
  });

  it("every term has both bookstaber and yardeni definitions", () => {
    for (const [key, value] of Object.entries(JARGON_DEFINITIONS)) {
      expect(value).toHaveProperty("bookstaber");
      expect(value).toHaveProperty("yardeni");
      expect(typeof value.bookstaber).toBe("string");
      expect(typeof value.yardeni).toBe("string");
      expect(value.bookstaber.length).toBeGreaterThan(0);
      expect(value.yardeni.length).toBeGreaterThan(0);
    }
  });

  it("bookstaber and yardeni definitions differ for every term", () => {
    for (const [key, value] of Object.entries(JARGON_DEFINITIONS)) {
      expect(value.bookstaber).not.toBe(value.yardeni);
    }
  });

  it("includes Pearson Correlation with framework-specific definitions", () => {
    const def = JARGON_DEFINITIONS["Pearson Correlation"];
    expect(def).toBeDefined();
    expect(def.bookstaber).toContain("contagion");
    expect(def.yardeni).toContain("revert");
  });

  it("includes HY Credit Spread with framework-specific definitions", () => {
    const def = JARGON_DEFINITIONS["HY Credit Spread"];
    expect(def).toBeDefined();
    expect(def.bookstaber).toContain("yield");
    expect(def.yardeni).toContain("cyclical");
  });

  it("includes BDC with framework-specific definitions", () => {
    const def = JARGON_DEFINITIONS["BDC"];
    expect(def).toBeDefined();
    expect(def.bookstaber).toContain("Business Development Company");
    expect(def.yardeni).toContain("Business Development Company");
  });

  it("includes VIX with framework-specific definitions", () => {
    const def = JARGON_DEFINITIONS["VIX"];
    expect(def).toBeDefined();
    expect(def.bookstaber).toContain("fear");
    expect(def.yardeni).toContain("short-lived");
  });

  it("includes MOVE with framework-specific definitions", () => {
    const def = JARGON_DEFINITIONS["MOVE"];
    expect(def).toBeDefined();
    expect(def.bookstaber).toContain("bond");
    expect(def.yardeni).toContain("bond");
  });

  it("includes SPY/RSP Ratio with framework-specific definitions", () => {
    const def = JARGON_DEFINITIONS["SPY/RSP Ratio"];
    expect(def).toBeDefined();
    expect(def.bookstaber).toContain("equal-weighted");
    expect(def.yardeni).toContain("equal-weighted");
  });

  it("includes Contagion with framework-specific definitions", () => {
    const def = JARGON_DEFINITIONS["Contagion"];
    expect(def).toBeDefined();
    expect(def.bookstaber).toContain("stress");
    expect(def.yardeni).toContain("stress");
  });

  it("includes Crude Oil Volatility (new term)", () => {
    const def = JARGON_DEFINITIONS["Crude Oil Volatility"];
    expect(def).toBeDefined();
    expect(def.bookstaber).toContain("destabilize");
    expect(def.yardeni).toContain("independence");
  });

  it("includes Composite Threat Score (new term)", () => {
    const def = JARGON_DEFINITIONS["Composite Threat Score"];
    expect(def).toBeDefined();
    expect(def.bookstaber).toContain("systemic risk");
    expect(def.yardeni).toContain("resilience");
  });
});
