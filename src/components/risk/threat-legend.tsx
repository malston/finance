"use client";

import { C } from "@/lib/theme";
import { useFramework } from "@/lib/framework-context";
import { FRAMEWORK_CONFIG } from "@/lib/framework-config";

export function ThreatLegend() {
  const { framework } = useFramework();
  const threatLevels = FRAMEWORK_CONFIG[framework].threatLevels;

  const levels = threatLevels.map((band, i) => {
    const label =
      i === 0
        ? `${band.level} (0\u2013${band.max})`
        : `${band.level} (>${threatLevels[i - 1].max}\u2013${band.max})`;
    return { color: band.color, label };
  });

  return (
    <div
      data-testid="threat-legend"
      style={{
        display: "flex",
        gap: 20,
        justifyContent: "center",
        padding: "8px 0",
        flexWrap: "wrap",
      }}
    >
      {levels.map((l) => (
        <div
          key={l.label}
          data-testid="legend-item"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 10,
            color: C.textDim,
            fontFamily: "var(--font-mono), JetBrains Mono, monospace",
          }}
        >
          <div
            data-testid="legend-dot"
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: l.color,
              boxShadow: `0 0 4px ${l.color}60`,
            }}
          />
          {l.label}
        </div>
      ))}
    </div>
  );
}
