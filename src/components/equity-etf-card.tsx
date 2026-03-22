"use client";

import { useState, useEffect } from "react";
import { C } from "@/lib/theme";

interface TickerRow {
  ticker: string;
  value: number;
  time: string;
  source: string;
}

type CardState =
  | { status: "loading" }
  | { status: "loaded"; rows: TickerRow[] }
  | { status: "error" };

export function EquityEtfCard() {
  const [state, setState] = useState<CardState>({ status: "loading" });

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch("/api/risk/latest-prices");
        if (!response.ok) {
          setState({ status: "error" });
          return;
        }
        const rows: TickerRow[] = await response.json();
        setState({ status: "loaded", rows });
      } catch {
        setState({ status: "error" });
      }
    }

    fetchData();
  }, []);

  return (
    <div
      data-testid="equity-etf-card"
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
        Equity & ETF Prices
      </div>

      {state.status === "loading" && (
        <div
          data-testid="equity-etf-loading"
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
          data-testid="equity-etf-error"
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
          Data unavailable
        </div>
      )}

      {state.status === "loaded" && (
        <div
          data-testid="equity-etf-table"
          style={{
            maxHeight: 320,
            overflowY: "auto",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontFamily: "var(--font-mono)",
              fontSize: 12,
            }}
          >
            <thead>
              <tr>
                {["Symbol", "Price", "Source", "Last Updated"].map((header) => (
                  <th
                    key={header}
                    style={{
                      textAlign: "left",
                      fontSize: 11,
                      color: C.textMuted,
                      fontWeight: 400,
                      padding: "4px 8px 6px",
                      borderBottom: `1px solid ${C.panelBorder}`,
                    }}
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => (
                <tr key={row.ticker}>
                  <td
                    style={{
                      padding: "4px 8px",
                      color: C.text,
                      fontWeight: 600,
                    }}
                  >
                    {row.ticker}
                  </td>
                  <td
                    style={{
                      padding: "4px 8px",
                      color: C.text,
                    }}
                  >
                    {row.value.toFixed(2)}
                  </td>
                  <td
                    style={{
                      padding: "4px 8px",
                      color: C.textMuted,
                    }}
                  >
                    {row.source}
                  </td>
                  <td
                    style={{
                      padding: "4px 8px",
                      color: C.textMuted,
                    }}
                  >
                    {new Date(row.time).toLocaleTimeString("en-US", {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
