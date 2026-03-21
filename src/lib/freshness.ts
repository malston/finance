export type FreshnessStatus = "live" | "stale" | "offline" | "no-data";

/**
 * Freshness thresholds per source type.
 * [0] = live threshold (green -> yellow boundary) in ms
 * [1] = stale threshold (yellow -> red boundary) in ms
 */
const THRESHOLDS: Record<string, [number, number]> = {
  finnhub: [15 * 60 * 1000, 60 * 60 * 1000],
  fred: [24 * 60 * 60 * 1000, 48 * 60 * 60 * 1000],
  computed: [24 * 60 * 60 * 1000, 48 * 60 * 60 * 1000],
};

const DEFAULT_THRESHOLDS: [number, number] = THRESHOLDS.finnhub;

/**
 * Determines the freshness status of a ticker based on its last update time
 * and the polling frequency of its data source.
 *
 * - live: data is within the source's normal update interval
 * - stale: data is older than expected but not critically so
 * - offline: data is significantly outdated
 * - no-data: no data has ever been recorded
 */
export function getFreshnessStatus(
  lastUpdated: string | null,
  source: string,
  now: Date = new Date(),
): FreshnessStatus {
  if (lastUpdated === null) return "no-data";

  const ageMs = now.getTime() - new Date(lastUpdated).getTime();
  const [liveThreshold, staleThreshold] =
    THRESHOLDS[source] ?? DEFAULT_THRESHOLDS;

  if (ageMs < liveThreshold) return "live";
  if (ageMs < staleThreshold) return "stale";
  return "offline";
}

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Formats a timestamp as a human-readable relative time string.
 * Returns "No data" for null timestamps.
 */
export function formatRelativeTime(
  timestamp: string | null,
  now: Date = new Date(),
): string {
  if (timestamp === null) return "No data";

  const ageMs = now.getTime() - new Date(timestamp).getTime();

  if (ageMs < 5 * SECOND) return "just now";
  if (ageMs < MINUTE) return `${Math.floor(ageMs / SECOND)}s ago`;
  if (ageMs < HOUR) return `${Math.floor(ageMs / MINUTE)}m ago`;
  if (ageMs < DAY) return `${Math.floor(ageMs / HOUR)}h ago`;
  return `${Math.floor(ageMs / DAY)}d ago`;
}
