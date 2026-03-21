"use client";

import { useState, useEffect, useCallback } from "react";
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
import { C } from "@/lib/theme";

const CONTAGION_THRESHOLD = 0.5;
const POLL_INTERVAL_MS = 60_000;
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

type ChartState =
  | { status: "loading" }
  | { status: "loaded"; data: CorrelationResponse }
  | { status: "empty" }
  | { status: "error" };

interface ChartDataPoint {
  time: string;
  value: number;
}

function formatTooltipValue(value: number): string {
  return value.toFixed(3);
}

export function CorrelationChart() {
  const [state, setState] = useState<ChartState>({ status: "loading" });

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(FETCH_URL);
      if (!response.ok) {
        setState({ status: "error" });
        return;
      }
      const data: CorrelationResponse = await response.json();

      const maxPairKey = data.max_current.pair as keyof Omit<
        CorrelationResponse,
        "max_current"
      >;
      const series = data[maxPairKey];
      if (!series || series.length === 0) {
        setState({ status: "empty" });
        return;
      }

      setState({ status: "loaded", data });
    } catch {
      setState({ status: "error" });
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const rhoColor =
    state.status === "loaded" && state.data.max_current.above_threshold
      ? C.red
      : C.yellow;

  const rhoValue =
    state.status === "loaded" ? state.data.max_current.value.toFixed(3) : "---";

  // Build chart data from the max correlation pair
  let chartData: ChartDataPoint[] = [];
  if (state.status === "loaded") {
    const pairKey = state.data.max_current.pair as keyof Omit<
      CorrelationResponse,
      "max_current"
    >;
    chartData = state.data[pairKey].map((pt) => ({
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
      {state.status === "loading" && (
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

      {state.status === "error" && (
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

      {state.status === "empty" && (
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

      {state.status === "loaded" && (
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
                label={{
                  value: "CONTAGION THRESHOLD",
                  position: "right",
                  fill: C.red,
                  fontSize: 8,
                }}
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
