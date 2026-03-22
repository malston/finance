import { describe, it, expect } from "vitest";

import {
  FRAMEWORK_CONFIG,
  parseFramework,
  type Framework,
} from "@/lib/framework-config";

describe("FRAMEWORK_CONFIG", () => {
  it("contains bookstaber and yardeni entries", () => {
    expect(FRAMEWORK_CONFIG.bookstaber).toBeDefined();
    expect(FRAMEWORK_CONFIG.yardeni).toBeDefined();
  });

  it("bookstaber has empty ticker prefix", () => {
    expect(FRAMEWORK_CONFIG.bookstaber.tickerPrefix).toBe("");
  });

  it("yardeni has YARDENI_ ticker prefix", () => {
    expect(FRAMEWORK_CONFIG.yardeni.tickerPrefix).toBe("YARDENI_");
  });

  it("bookstaber contagion threshold is 0.5", () => {
    expect(FRAMEWORK_CONFIG.bookstaber.contagionThreshold).toBe(0.5);
  });

  it("yardeni contagion threshold is 0.85", () => {
    expect(FRAMEWORK_CONFIG.yardeni.contagionThreshold).toBe(0.85);
  });

  it("bookstaber weights sum to 1.0", () => {
    const weights = FRAMEWORK_CONFIG.bookstaber.weights;
    const sum =
      weights.private_credit +
      weights.ai_concentration +
      weights.energy_geo +
      weights.contagion;
    expect(sum).toBeCloseTo(1.0);
  });

  it("yardeni weights sum to 1.0", () => {
    const weights = FRAMEWORK_CONFIG.yardeni.weights;
    const sum =
      weights.private_credit +
      weights.ai_concentration +
      weights.energy_geo +
      weights.contagion;
    expect(sum).toBeCloseTo(1.0);
  });

  it("bookstaber weights match expected values", () => {
    const w = FRAMEWORK_CONFIG.bookstaber.weights;
    expect(w.private_credit).toBe(0.3);
    expect(w.ai_concentration).toBe(0.2);
    expect(w.energy_geo).toBe(0.25);
    expect(w.contagion).toBe(0.25);
  });

  it("yardeni weights match expected values", () => {
    const w = FRAMEWORK_CONFIG.yardeni.weights;
    expect(w.private_credit).toBe(0.25);
    expect(w.ai_concentration).toBe(0.2);
    expect(w.energy_geo).toBe(0.3);
    expect(w.contagion).toBe(0.25);
  });

  it("bookstaber threat levels have 4 bands", () => {
    expect(FRAMEWORK_CONFIG.bookstaber.threatLevels).toHaveLength(4);
  });

  it("yardeni threat levels have 4 bands", () => {
    expect(FRAMEWORK_CONFIG.yardeni.threatLevels).toHaveLength(4);
  });

  it("bookstaber LOW band max is 25", () => {
    const low = FRAMEWORK_CONFIG.bookstaber.threatLevels.find(
      (t) => t.level === "LOW",
    );
    expect(low?.max).toBe(25);
  });

  it("yardeni LOW band max is 30", () => {
    const low = FRAMEWORK_CONFIG.yardeni.threatLevels.find(
      (t) => t.level === "LOW",
    );
    expect(low?.max).toBe(30);
  });

  it("bookstaber news sort direction is ascending", () => {
    expect(FRAMEWORK_CONFIG.bookstaber.newsSortDirection).toBe("asc");
  });

  it("yardeni news sort direction is descending", () => {
    expect(FRAMEWORK_CONFIG.yardeni.newsSortDirection).toBe("desc");
  });
});

describe("parseFramework", () => {
  it("returns bookstaber for null input", () => {
    expect(parseFramework(null)).toBe("bookstaber");
  });

  it("returns bookstaber for empty string", () => {
    expect(parseFramework("")).toBe("bookstaber");
  });

  it("returns bookstaber for 'bookstaber'", () => {
    expect(parseFramework("bookstaber")).toBe("bookstaber");
  });

  it("returns yardeni for 'yardeni'", () => {
    expect(parseFramework("yardeni")).toBe("yardeni");
  });

  it("returns bookstaber for invalid value", () => {
    expect(parseFramework("invalid")).toBe("bookstaber");
  });

  it("returns bookstaber for random string", () => {
    expect(parseFramework("foobar")).toBe("bookstaber");
  });
});
