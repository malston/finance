import { useId } from "react";

interface SparklineProps {
  data: number[];
  color: string;
  width?: number;
  height?: number;
  alert?: boolean;
}

/**
 * Pure SVG sparkline with gradient fill area below the line.
 * Renders a polyline for the data points and optionally a glowing end dot for alert state.
 */
export function Sparkline({
  data,
  color,
  width = 160,
  height = 40,
  alert = false,
}: SparklineProps) {
  const uniqueId = useId();
  const gradientId = `sparkline-grad-${uniqueId}`;

  if (data.length === 0) {
    return (
      <svg width={width} height={height}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.25} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>
    );
  }

  const padding = 2;
  const plotW = width - padding * 2;
  const plotH = height - padding * 2;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * plotW;
    const y = padding + plotH - ((v - min) / range) * plotH;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const polylinePoints = points.join(" ");

  // Polygon: line points + bottom-right + bottom-left to close the fill area
  const lastX = padding + plotW;
  const firstX = padding;
  const bottom = height;
  const polygonPoints = `${polylinePoints} ${lastX.toFixed(1)},${bottom} ${firstX.toFixed(1)},${bottom}`;

  const lastPoint = data[data.length - 1];
  const lastPx = padding + ((data.length - 1) / (data.length - 1)) * plotW;
  const lastPy = padding + plotH - ((lastPoint - min) / range) * plotH;

  return (
    <svg width={width} height={height}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>

      <polygon points={polygonPoints} fill={`url(#${gradientId})`} />

      <polyline
        points={polylinePoints}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {alert && (
        <circle
          data-testid="sparkline-dot"
          cx={lastPx}
          cy={lastPy}
          r={3}
          fill={color}
          filter="drop-shadow(0 0 3px rgba(255,255,255,0.5))"
        />
      )}
    </svg>
  );
}
