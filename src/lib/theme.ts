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
