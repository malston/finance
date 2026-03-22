"use client";

import { C } from "@/lib/theme";
import { useFramework } from "@/lib/framework-context";
import { FRAMEWORK_CONFIG } from "@/lib/framework-config";

function bandLabel(level: string, min: number, max: number): string {
  return `${level} (${min}-${max})`;
}

export function ThreatLegend() {
  const { framework } = useFramework();
  const threatLevels = FRAMEWORK_CONFIG[framework].threatLevels;

  const levels = threatLevels.map((band, i) => {
    const min = i === 0 ? 0 : threatLevels[i - 1].max + 1;
    return {
      color: band.color,
      label: bandLabel(band.level, min, band.max),
    };
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
