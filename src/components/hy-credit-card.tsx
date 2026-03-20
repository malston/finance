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

type CardState =
  | { status: "loading" }
  | { status: "loaded"; data: TimeSeriesRow[]; latestValue: number }
  | { status: "error"; lastUpdated?: string };

export function HYCreditSpreadCard() {
  const [state, setState] = useState<CardState>({ status: "loading" });

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch(
          "/api/risk/timeseries?ticker=BAMLH0A0HYM2&days=79",
        );
        if (!response.ok) {
          setState({
            status: "error",
            lastUpdated: new Date().toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            }),
          });
          return;
        }
        const data: TimeSeriesRow[] = await response.json();
        const latestValue = data.length > 0 ? data[data.length - 1].value : 0;
        setState({ status: "loaded", data, latestValue });
      } catch {
        setState({
          status: "error",
          lastUpdated: new Date().toLocaleTimeString("en-US", {
            hour: "numeric",
            minute: "2-digit",
          }),
        });
      }
    }

    fetchData();
  }, []);

  return (
    <div
      data-testid="hy-credit-card"
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
        HY Credit Spread (BAMLH0A0HYM2)
      </div>

      {state.status === "loading" && (
        <div
          data-testid="hy-spread-loading"
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
        <div>
          <div
            data-testid="stale-data-badge"
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
            {state.lastUpdated && (
              <span data-testid="stale-timestamp">
                {" "}
                · Last updated {state.lastUpdated}
              </span>
            )}
          </div>
        </div>
      )}

      {state.status === "loaded" && (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span
              data-testid="hy-spread-value"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 18,
                fontWeight: 700,
                color: C.text,
              }}
            >
              {state.latestValue.toFixed(1)}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: C.textMuted,
              }}
            >
              bps
            </span>
          </div>

          {state.data.length > 0 && (
            <div style={{ height: 180, marginTop: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={state.data.map((d) => ({
                    time: new Date(d.time).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    }),
                    value: d.value,
                  }))}
                  margin={{ top: 4, right: 4, bottom: 4, left: 4 }}
                >
                  <XAxis dataKey="time" hide />
                  <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
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
                    stroke={C.red}
                    fill={C.red}
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
