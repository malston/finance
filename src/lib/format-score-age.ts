export const STALENESS_THRESHOLD_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Returns true when the score timestamp is older than the threshold.
 * Returns false for null, future, or fresh timestamps.
 */
export function isScoreAged(
  updatedAt: string | null,
  thresholdMs: number = STALENESS_THRESHOLD_MS,
): boolean {
  if (updatedAt === null) return false;
  const age = Date.now() - new Date(updatedAt).getTime();
  if (Number.isNaN(age)) return false; // malformed date string
  if (age < 0) return false; // future timestamp (clock skew)
  return age >= thresholdMs;
}

const etFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/**
 * Formats a UTC timestamp as "as of {weekday}, {month} {day}, {time} ET".
 * Returns null for malformed date strings.
 */
export function formatScoreTimestamp(updatedAt: string): string | null {
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  const formatted = etFormatter.format(date);
  return `as of ${formatted} ET`;
}
