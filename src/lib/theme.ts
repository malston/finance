/**
 * Color system for the Bookstaber Risk Monitor dashboard.
 * Values sourced from the prototype design specification.
 */
export const C = {
  bg: "#0a0e17",
  panel: "#111827",
  panelBorder: "#1e293b",
  panelHover: "#151d2e",
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#475569",
  green: "#22c55e",
  greenDim: "#166534",
  yellow: "#eab308",
  yellowDim: "#854d0e",
  orange: "#f97316",
  orangeDim: "#9a3412",
  red: "#ef4444",
  redDim: "#991b1b",
  blue: "#3b82f6",
  cyan: "#06b6d4",
  purple: "#a855f7",
  accent: "#f59e0b",
} as const;

export type ColorKey = keyof typeof C;

/**
 * Maps a threat score (0-100) to the corresponding color hex value.
 * 0-25: green (LOW), 26-50: yellow (ELEVATED), 51-75: orange (HIGH), 76-100: red (CRITICAL)
 */
export function threatColor(level: number): string {
  if (level <= 25) return C.green;
  if (level <= 50) return C.yellow;
  if (level <= 75) return C.orange;
  return C.red;
}

/**
 * Maps a threat score (0-100) to a human-readable label.
 * 0-25: LOW, 26-50: ELEVATED, 51-75: HIGH, 76-100: CRITICAL
 */
export function threatLabel(level: number): string {
  if (level <= 25) return "LOW";
  if (level <= 50) return "ELEVATED";
  if (level <= 75) return "HIGH";
  return "CRITICAL";
}
