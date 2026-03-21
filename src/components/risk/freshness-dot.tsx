import { C } from "@/lib/theme";
import {
  getFreshnessStatus,
  formatRelativeTime,
  type FreshnessStatus,
} from "@/lib/freshness";

interface FreshnessDotProps {
  lastUpdated: string | null;
  source: string;
}

const STATUS_COLORS: Record<FreshnessStatus, string> = {
  live: C.green,
  stale: C.yellow,
  offline: C.red,
  "no-data": C.textMuted,
};

function buildTooltip(
  status: FreshnessStatus,
  lastUpdated: string | null,
): string {
  if (status === "no-data") return "No data";
  const relative = formatRelativeTime(lastUpdated);
  if (status === "live") return `Last updated: ${relative}`;
  return `Stale: last update ${relative}`;
}

/**
 * 6px colored circle indicating data freshness for a ticker.
 * Green = live, yellow = slightly stale, red = significantly stale, gray = no data.
 * Green dots pulse gently to indicate live data flow.
 */
export function FreshnessDot({ lastUpdated, source }: FreshnessDotProps) {
  const status = getFreshnessStatus(lastUpdated, source);
  const color = STATUS_COLORS[status];
  const isLive = status === "live";
  const tooltip = buildTooltip(status, lastUpdated);

  return (
    <span
      data-testid="freshness-dot"
      title={tooltip}
      style={{
        display: "inline-block",
        width: "6px",
        height: "6px",
        borderRadius: "50%",
        backgroundColor: color,
        flexShrink: 0,
        animationName: isLive ? "freshness-pulse" : "",
        animationDuration: isLive ? "2s" : "",
        animationTimingFunction: isLive ? "ease-in-out" : "",
        animationIterationCount: isLive ? "infinite" : "",
      }}
    />
  );
}
