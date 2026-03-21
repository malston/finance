import { C } from "@/lib/theme";

const LEVELS = [
  { color: C.green, label: "LOW (0-25)" },
  { color: C.yellow, label: "ELEVATED (26-50)" },
  { color: C.orange, label: "HIGH (51-75)" },
  { color: C.red, label: "CRITICAL (76-100)" },
];

export function ThreatLegend() {
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
      {LEVELS.map((l) => (
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
