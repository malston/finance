import { AlertTriangle } from "lucide-react";
import { C } from "@/lib/theme";

interface StaleBadgeProps {
  lastSuccess: string | null;
  visible?: boolean;
}

function formatLastUpdated(lastSuccess: string | null): string {
  if (!lastSuccess) return "never";
  const date = new Date(lastSuccess);
  return date.toLocaleString();
}

/**
 * Small inline badge showing "Data stale - last updated {time}"
 * for ticker rows whose data source is stale.
 */
export function StaleBadge({ lastSuccess, visible = true }: StaleBadgeProps) {
  if (!visible) return null;

  return (
    <div
      data-testid="stale-badge"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9,
        fontFamily: "var(--font-mono), JetBrains Mono, monospace",
        color: C.orange,
        padding: "2px 0",
      }}
    >
      <AlertTriangle size={10} />
      Data stale - last updated {formatLastUpdated(lastSuccess)}
    </div>
  );
}
