import { FRAMEWORK_CONFIG, type Framework } from "./framework-config";

export interface ThreatLevel {
  level: "LOW" | "ELEVATED" | "HIGH" | "CRITICAL";
  color: string;
}

/**
 * Maps a numeric score (0-100) to a threat level label and color.
 *
 * Band boundaries differ by framework:
 * - bookstaber: 0-25 LOW, 26-50 ELEVATED, 51-75 HIGH, 76-100 CRITICAL
 * - yardeni:    0-30 LOW, 31-55 ELEVATED, 56-80 HIGH, 81-100 CRITICAL
 */
export function getThreatLevel(
  score: number,
  framework: Framework = "bookstaber",
): ThreatLevel {
  const thresholds = FRAMEWORK_CONFIG[framework].threatLevels;
  for (const threshold of thresholds) {
    if (score <= threshold.max) {
      return { level: threshold.level, color: threshold.color };
    }
  }
  const last = thresholds[thresholds.length - 1];
  return { level: last.level, color: last.color };
}
