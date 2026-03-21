export interface ThreatLevel {
  level: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  color: string;
}

const THRESHOLDS: {
  max: number;
  level: ThreatLevel["level"];
  color: string;
}[] = [
  { max: 25, level: "LOW", color: "#22c55e" },
  { max: 50, level: "ELEVATED", color: "#eab308" },
  { max: 75, level: "HIGH", color: "#f97316" },
  { max: 100, level: "CRITICAL", color: "#ef4444" },
];

/**
 * Maps a numeric score (0-100) to a threat level label and color.
 *
 * Thresholds: 0-25 LOW, 26-50 ELEVATED, 51-75 HIGH, 76-100 CRITICAL.
 */
export function getThreatLevel(score: number): ThreatLevel {
  for (const threshold of THRESHOLDS) {
    if (score <= threshold.max) {
      return { level: threshold.level, color: threshold.color };
    }
  }
  const last = THRESHOLDS[THRESHOLDS.length - 1];
  return { level: last.level, color: last.color };
}
