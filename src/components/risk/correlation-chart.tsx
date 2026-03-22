"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { C } from "@/lib/theme";

const CONTAGION_THRESHOLD = 0.5;
const FETCH_URL = "/api/risk/correlations?days=79";

interface CorrelationPoint {
  time: string;
  value: number;
}

interface MaxCurrent {
  pair: string;
  value: number;
  above_threshold: boolean;
}

interface CorrelationResponse {
  credit_tech: CorrelationPoint[];
  credit_energy: CorrelationPoint[];
  tech_energy: CorrelationPoint[];
  max_current: MaxCurrent;
}

interface ChartDataPoint {
  time: string;
  value: number;
}

function formatTooltipValue(value: number): string {
  return value.toFixed(3);
}

export function CorrelationChart() {
  const { data, isLoading, isError } = useQuery<CorrelationResponse>({
    queryKey: ["correlations"],
    queryFn: async () => {
      const response = await fetch(FETCH_URL);
      if (!response.ok) throw new Error("Failed to fetch correlations");
      return response.json();
    },
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  // Derive display state from query result
  const isEmpty = data
    ? (() => {
        const pairKey = data.max_current.pair as keyof Omit<
          CorrelationResponse,
          "max_current"
        >;
        const series = data[pairKey];
        return !series || series.length === 0;
      })()
    : false;

  const status = isLoading
    ? "loading"
    : isError
      ? "error"
      : isEmpty
        ? "empty"
        : "loaded";

  const rhoColor =
    status === "loaded" && data!.max_current.above_threshold ? C.red : C.yellow;

  const rhoValue =
    status === "loaded" ? data!.max_current.value.toFixed(3) : "---";

  // Build chart data from the max correlation pair
  let chartData: ChartDataPoint[] = [];
  if (status === "loaded" && data) {
    const pairKey = data.max_current.pair as keyof Omit<
      CorrelationResponse,
      "max_current"
    >;
    chartData = data[pairKey].map((pt) => ({
      time: pt.time,
      value: pt.value,
    }));
  }

  return (
    <div
      data-testid="correlation-chart-panel"
      style={{
        background: C.panel,
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        padding: "16px 16px 8px 8px",
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          padding: "0 0 0 8px",
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
            Cross-Domain Correlation Monitor
          </div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>
            BDC ↔ Big Tech 30-day rolling correlation — above 0.5 signals
            contagion
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span
            style={{
              fontSize: 10,
              color: C.textDim,
              fontFamily: "var(--font-mono)",
            }}
          >
            ρ ={" "}
          </span>
          <span
            data-testid="correlation-rho-value"
            style={{
              fontFamily: "'JetBrains Mono', var(--font-mono), monospace",
              fontSize: 18,
              fontWeight: 700,
              color: rhoColor,
            }}
          >
            {rhoValue}
          </span>
        </div>
      </div>

      {/* Chart body */}
      {status === "loading" && (
        <div
          data-testid="correlation-chart-loading"
          style={{
            height: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.textDim,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
        >
          Loading correlation data...
        </div>
      )}

      {status === "error" && (
        <div
          data-testid="correlation-chart-error"
          style={{
            height: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.red,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
        >
          Failed to load correlation data
        </div>
      )}

      {status === "empty" && (
        <div
          style={{
            height: 180,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: C.textDim,
            fontSize: 12,
            fontFamily: "var(--font-mono)",
          }}
        >
          No correlation data
        </div>
      )}

      {status === "loaded" && (
        <div data-testid="correlation-chart-container" style={{ marginTop: 8 }}>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient
                  id="correlationGradient"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor={C.red} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={C.red} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.panelBorder} />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: C.textDim }}
                tickLine={false}
                axisLine={false}
                interval={14}
              />
              <YAxis
                domain={[-0.2, 1]}
                tick={{ fontSize: 9, fill: C.textDim }}
                tickLine={false}
                axisLine={false}
              />
              <ReferenceLine
                y={CONTAGION_THRESHOLD}
                stroke={C.red}
                strokeDasharray="4 4"
                label={({
                  viewBox,
                }: {
                  viewBox: { x?: number; y?: number; width?: number };
                }) => (
                  <text
                    data-testid="contagion-threshold-label"
                    x={(viewBox.x ?? 0) + (viewBox.width ?? 0) + 4}
                    y={(viewBox.y ?? 0) - 4}
                    fill={C.red}
                    fontSize={8}
                    textAnchor="end"
                  >
                    CONTAGION THRESHOLD
                  </text>
                )}
              />
              <ReferenceLine
                y={0}
                stroke={C.textDim}
                strokeDasharray="2 2"
                strokeOpacity={0.3}
              />
              <Tooltip
                contentStyle={{
                  background: C.panel,
                  border: `1px solid ${C.panelBorder}`,
                  fontFamily: "'JetBrains Mono', var(--font-mono), monospace",
                  fontSize: 11,
                }}
                formatter={(value: number) => [
                  `Correlation: ${formatTooltipValue(value)}`,
                ]}
                labelStyle={{ color: C.textDim }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={C.red}
                strokeWidth={2}
                fill="url(#correlationGradient)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
