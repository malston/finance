"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { C } from "@/lib/theme";

interface TimeSeriesRow {
  time: string;
  ticker: string;
  value: number;
  source: string;
}

interface SeriesData {
  dgs10: TimeSeriesRow[];
  dgs2: TimeSeriesRow[];
  t10y2y: TimeSeriesRow[];
}

type CardState =
  | { status: "loading" }
  | { status: "loaded"; data: SeriesData }
  | { status: "error" };

function latestValue(rows: TimeSeriesRow[]): number {
  return rows.length > 0 ? rows[rows.length - 1].value : 0;
}

export function TreasuryCreditCard() {
  const [state, setState] = useState<CardState>({ status: "loading" });

  useEffect(() => {
    async function fetchAll() {
      try {
        const [dgs10Res, dgs2Res, t10y2yRes] = await Promise.all([
          fetch("/api/risk/timeseries?ticker=DGS10&days=79"),
          fetch("/api/risk/timeseries?ticker=DGS2&days=79"),
          fetch("/api/risk/timeseries?ticker=T10Y2Y&days=79"),
        ]);

        if (!dgs10Res.ok || !dgs2Res.ok || !t10y2yRes.ok) {
          setState({ status: "error" });
          return;
        }

        const [dgs10, dgs2, t10y2y] = await Promise.all([
          dgs10Res.json() as Promise<TimeSeriesRow[]>,
          dgs2Res.json() as Promise<TimeSeriesRow[]>,
          t10y2yRes.json() as Promise<TimeSeriesRow[]>,
        ]);

        setState({ status: "loaded", data: { dgs10, dgs2, t10y2y } });
      } catch {
        setState({ status: "error" });
      }
    }

    fetchAll();
  }, []);

  return (
    <div
      data-testid="treasury-credit-card"
      style={{
        background: C.panel,
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        padding: "14px 16px",
        minHeight: 60,
      }}
    >
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: C.text,
          marginBottom: 8,
        }}
      >
        Treasury & Credit Spreads
      </div>

      {state.status === "loading" && (
        <div
          data-testid="treasury-loading"
          style={{
            fontSize: 11,
            color: C.textMuted,
            fontFamily: "var(--font-mono)",
          }}
        >
          Loading...
        </div>
      )}

      {state.status === "error" && (
        <div
          data-testid="treasury-stale-badge"
          style={{
            display: "inline-block",
            background: C.orange,
            color: "#fff",
            fontSize: 9,
            fontFamily: "var(--font-mono)",
            padding: "2px 6px",
            borderRadius: 4,
          }}
        >
          Data stale
        </div>
      )}

      {state.status === "loaded" && (
        <>
          <div style={{ display: "flex", gap: 16, marginBottom: 8 }}>
            <ValueDisplay
              testId="dgs10-value"
              label="10Y"
              value={latestValue(state.data.dgs10)}
            />
            <ValueDisplay
              testId="dgs2-value"
              label="2Y"
              value={latestValue(state.data.dgs2)}
            />
            <ValueDisplay
              testId="t10y2y-value"
              label="Curve"
              value={latestValue(state.data.t10y2y)}
            />
          </div>

          {state.data.t10y2y.length > 0 && (
            <div style={{ height: 120, marginTop: 4 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={state.data.t10y2y.map((d) => ({
                    time: new Date(d.time).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    }),
                    value: d.value,
                  }))}
                  margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
                >
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={["dataMin - 0.1", "dataMax + 0.1"]} />
                  <Tooltip
                    contentStyle={{
                      background: C.panel,
                      border: `1px solid ${C.panelBorder}`,
                      borderRadius: 6,
                      fontSize: 11,
                      color: C.text,
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke={C.cyan}
                    fill={C.cyan}
                    fillOpacity={0.15}
                    strokeWidth={2}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ValueDisplay({
  testId,
  label,
  value,
}: {
  testId: string;
  label: string;
  value: number;
}) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
      <span
        style={{
          fontSize: 11,
          color: C.textMuted,
        }}
      >
        {label}
      </span>
      <span
        data-testid={testId}
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 14,
          fontWeight: 700,
          color: C.text,
        }}
      >
        {value.toFixed(2)}%
      </span>
    </div>
  );
}
