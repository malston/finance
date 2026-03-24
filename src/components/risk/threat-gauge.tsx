import { useId } from "react";
import { getThreatLevel } from "@/lib/threat-levels";
import type { Framework } from "@/lib/framework-config";

interface ThreatGaugeProps {
  score: number | null;
  color: string;
  size?: number;
  framework?: Framework;
}

/**
 * Semicircular arc gauge displaying a threat score (0-100).
 * Renders an SVG arc from bottom-left to bottom-right (270 degrees sweep).
 * When score is null, displays "--" with no threat level label.
 */
export function ThreatGauge({
  score,
  color,
  size = 90,
  framework,
}: ThreatGaugeProps) {
  const hasScore = score !== null;
  const label = hasScore ? getThreatLevel(score, framework).level : "";
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;
  const strokeWidth = size * 0.07;

  // Arc spans 270 degrees, starting at 135 degrees (bottom-left)
  const startAngle = 135;
  const totalSweep = 270;
  const scoreAngle = hasScore
    ? (Math.min(Math.max(score, 0), 100) / 100) * totalSweep
    : 0;

  const uniqueId = useId();
  const filterId = `glow-${uniqueId}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      data-testid="threat-gauge"
    >
      <defs>
        <filter id={filterId}>
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feFlood floodColor={color} floodOpacity="0.5" result="color" />
          <feComposite in="color" in2="blur" operator="in" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background track */}
      <path
        data-testid="gauge-track"
        d={describeArc(cx, cy, r, startAngle, startAngle + totalSweep)}
        fill="none"
        stroke="#1e293b"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />

      {/* Score arc */}
      {scoreAngle > 0 && (
        <path
          data-testid="gauge-arc"
          d={describeArc(cx, cy, r, startAngle, startAngle + scoreAngle)}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          filter={`url(#${filterId})`}
        />
      )}

      {/* Score text */}
      <text
        data-testid="gauge-score"
        x={cx}
        y={cy - 2}
        textAnchor="middle"
        dominantBaseline="central"
        fill={color}
        fontFamily="var(--font-mono), JetBrains Mono, monospace"
        fontSize={size * 0.24}
        fontWeight={700}
      >
        {hasScore ? Math.round(score) : "--"}
      </text>

      {/* Level label */}
      <text
        data-testid="gauge-label"
        x={cx}
        y={cy + size * 0.18}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#475569"
        fontFamily="var(--font-mono), JetBrains Mono, monospace"
        fontSize={size * 0.1}
      >
        {label}
      </text>
    </svg>
  );
}

function polarToCartesian(
  cx: number,
  cy: number,
  r: number,
  angleDeg: number,
): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number,
): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 0 ${end.x} ${end.y}`;
}
