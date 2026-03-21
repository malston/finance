"use client";

import { useState } from "react";
import { C } from "@/lib/theme";
import { useSourceHealth, type OverallStatus } from "@/hooks/use-source-health";

const STATUS_COLORS: Record<OverallStatus, string> = {
  healthy: C.green,
  degraded: C.orange,
  down: C.red,
  unknown: C.textMuted,
};

function formatTime(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString();
}

/**
 * Header health dot showing overall data pipeline status.
 * Green = all healthy, orange = some stale, red = all down, gray = unavailable.
 * Hover to see per-source status with last success times.
 */
export function HealthIndicator() {
  const [hovered, setHovered] = useState(false);
  const { sources, overallStatus } = useSourceHealth();

  const dotColor = STATUS_COLORS[overallStatus];

  return (
    <div
      data-testid="health-indicator"
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div
        data-testid="health-dot"
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          backgroundColor: dotColor,
          cursor: "pointer",
        }}
      />

      {hovered && (
        <div
          data-testid="health-tooltip"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 8,
            padding: "10px 14px",
            background: C.panel,
            border: `1px solid ${C.panelBorder}`,
            borderRadius: 6,
            fontSize: 11,
            fontFamily: "var(--font-mono), JetBrains Mono, monospace",
            color: C.text,
            whiteSpace: "nowrap",
            zIndex: 50,
            minWidth: 220,
          }}
        >
          {overallStatus === "unknown" ? (
            <div>Health check unavailable</div>
          ) : (
            sources.map((s) => (
              <div
                key={s.source}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  padding: "3px 0",
                }}
              >
                <span style={{ fontWeight: 600 }}>{s.source}</span>
                <span
                  style={{
                    color: s.stale ? C.orange : C.green,
                  }}
                >
                  {s.stale ? "STALE" : "OK"} - {formatTime(s.last_success)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
