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
 * Formats a UTC timestamp as "as of Fri, Mar 20 4:00 PM ET".
 */
export function formatScoreTimestamp(updatedAt: string): string {
  const formatted = etFormatter.format(new Date(updatedAt));
  return `as of ${formatted} ET`;
}
