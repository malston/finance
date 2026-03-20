import { describe, it, expect } from "vitest";
import { C, threatColor, threatLabel } from "@/lib/theme";

describe("theme color constants", () => {
  it("exports all required color values with exact hex codes", () => {
    expect(C.bg).toBe("#0a0e17");
    expect(C.panel).toBe("#111827");
    expect(C.panelBorder).toBe("#1e293b");
    expect(C.panelHover).toBe("#151d2e");
    expect(C.text).toBe("#e2e8f0");
    expect(C.textMuted).toBe("#64748b");
    expect(C.textDim).toBe("#475569");
    expect(C.green).toBe("#22c55e");
    expect(C.greenDim).toBe("#166534");
    expect(C.yellow).toBe("#eab308");
    expect(C.yellowDim).toBe("#854d0e");
    expect(C.orange).toBe("#f97316");
    expect(C.orangeDim).toBe("#9a3412");
    expect(C.red).toBe("#ef4444");
    expect(C.redDim).toBe("#991b1b");
    expect(C.blue).toBe("#3b82f6");
    expect(C.cyan).toBe("#06b6d4");
    expect(C.purple).toBe("#a855f7");
    expect(C.accent).toBe("#f59e0b");
  });

  it("has the correct TypeScript type (readonly object)", () => {
    // Verify it's a plain object with string values
    const keys = Object.keys(C);
    expect(keys.length).toBeGreaterThanOrEqual(19);
    for (const key of keys) {
      expect(typeof C[key as keyof typeof C]).toBe("string");
    }
  });
});

describe("threatColor", () => {
  it("returns green for levels 0-25", () => {
    expect(threatColor(0)).toBe(C.green);
    expect(threatColor(10)).toBe(C.green);
    expect(threatColor(25)).toBe(C.green);
  });

  it("returns yellow for levels 26-50", () => {
    expect(threatColor(26)).toBe(C.yellow);
    expect(threatColor(35)).toBe(C.yellow);
    expect(threatColor(50)).toBe(C.yellow);
  });

  it("returns orange for levels 51-75", () => {
    expect(threatColor(51)).toBe(C.orange);
    expect(threatColor(68)).toBe(C.orange);
    expect(threatColor(75)).toBe(C.orange);
  });

  it("returns red for levels 76-100", () => {
    expect(threatColor(76)).toBe(C.red);
    expect(threatColor(90)).toBe(C.red);
    expect(threatColor(100)).toBe(C.red);
  });
});

describe("threatLabel", () => {
  it("returns LOW for levels 0-25", () => {
    expect(threatLabel(0)).toBe("LOW");
    expect(threatLabel(25)).toBe("LOW");
  });

  it("returns ELEVATED for levels 26-50", () => {
    expect(threatLabel(26)).toBe("ELEVATED");
    expect(threatLabel(50)).toBe("ELEVATED");
  });

  it("returns HIGH for levels 51-75", () => {
    expect(threatLabel(51)).toBe("HIGH");
    expect(threatLabel(75)).toBe("HIGH");
  });

  it("returns CRITICAL for levels 76-100", () => {
    expect(threatLabel(76)).toBe("CRITICAL");
    expect(threatLabel(100)).toBe("CRITICAL");
  });
});
