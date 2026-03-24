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

  describe("with framework parameter", () => {
    it("defaults to bookstaber bands when no framework specified", () => {
      expect(getThreatLevel(25).level).toBe("LOW");
      expect(getThreatLevel(26).level).toBe("ELEVATED");
    });

    it("uses bookstaber bands when framework is bookstaber", () => {
      expect(getThreatLevel(25, "bookstaber").level).toBe("LOW");
      expect(getThreatLevel(26, "bookstaber").level).toBe("ELEVATED");
      expect(getThreatLevel(50, "bookstaber").level).toBe("ELEVATED");
      expect(getThreatLevel(51, "bookstaber").level).toBe("HIGH");
      expect(getThreatLevel(75, "bookstaber").level).toBe("HIGH");
      expect(getThreatLevel(76, "bookstaber").level).toBe("CRITICAL");
    });

    it("uses yardeni bands when framework is yardeni", () => {
      expect(getThreatLevel(30, "yardeni").level).toBe("LOW");
      expect(getThreatLevel(31, "yardeni").level).toBe("ELEVATED");
      expect(getThreatLevel(55, "yardeni").level).toBe("ELEVATED");
      expect(getThreatLevel(56, "yardeni").level).toBe("HIGH");
      expect(getThreatLevel(80, "yardeni").level).toBe("HIGH");
      expect(getThreatLevel(81, "yardeni").level).toBe("CRITICAL");
    });

    it("score 30 is ELEVATED under bookstaber but LOW under yardeni", () => {
      expect(getThreatLevel(30, "bookstaber").level).toBe("ELEVATED");
      expect(getThreatLevel(30, "yardeni").level).toBe("LOW");
    });

    it("score 76 is CRITICAL under bookstaber but HIGH under yardeni", () => {
      expect(getThreatLevel(76, "bookstaber").level).toBe("CRITICAL");
      expect(getThreatLevel(76, "yardeni").level).toBe("HIGH");
    });

    it("returns correct colors for yardeni bands", () => {
      expect(getThreatLevel(30, "yardeni").color).toBe("#22c55e");
      expect(getThreatLevel(31, "yardeni").color).toBe("#eab308");
      expect(getThreatLevel(56, "yardeni").color).toBe("#f97316");
      expect(getThreatLevel(81, "yardeni").color).toBe("#ef4444");
    });
  });

  describe("input validation", () => {
    it("warns and clamps negative scores", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = getThreatLevel(-5);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("-5"));
      expect(result.level).toBe("LOW");
      spy.mockRestore();
    });

    it("warns and clamps scores above 100", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = getThreatLevel(150);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("150"));
      expect(result.level).toBe("CRITICAL");
      spy.mockRestore();
    });

    it("warns and returns CRITICAL for NaN", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = getThreatLevel(NaN);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("NaN"));
      expect(result.level).toBe("CRITICAL");
      spy.mockRestore();
    });

    it("warns and returns CRITICAL for Infinity", () => {
      const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = getThreatLevel(Infinity);
      expect(spy).toHaveBeenCalledWith(expect.stringContaining("Infinity"));
      expect(result.level).toBe("CRITICAL");
      spy.mockRestore();
    });
  });
});
