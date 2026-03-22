import { C } from "@/lib/theme";
import { Sparkline } from "./sparkline";
import { StaleBadge } from "./stale-badge";
import { FreshnessDot } from "./freshness-dot";
import { AlertTriangle } from "lucide-react";

interface TickerRowProps {
  symbol: string;
  label: string;
  price: number;
  change: number;
  timeseries: number[];
  color: string;
  inverted?: boolean;
  alertMessage?: string;
  staleLastSuccess?: string | null;
  freshnessLastUpdated?: string | null;
  freshnessSource?: string;
}

/**
 * A single row in the sector panel ticker table.
 * Shows symbol, label, sparkline, price, and daily change with color coding.
 */
export function TickerRow({
  symbol,
  label,
  price,
  change,
  timeseries,
  color,
  inverted = false,
  alertMessage,
  staleLastSuccess,
  freshnessLastUpdated,
  freshnessSource,
}: TickerRowProps) {
  const isStale = staleLastSuccess !== undefined;
  const isPositive = change >= 0;
  const changeColor = inverted
    ? isPositive
      ? C.red
      : C.green
    : isPositive
      ? C.green
      : C.red;

  const changeStr = `${isPositive ? "+" : ""}${change.toFixed(2)}%`;
  const hasAlert = !!alertMessage;

  return (
    <div data-testid={`ticker-row-${symbol}`}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "90px 1fr 160px 80px",
          alignItems: "center",
          padding: "6px 0",
          borderBottom: `1px solid ${C.panelBorder}`,
        }}
      >
        {/* Symbol + label */}
        <div>
          <div
            data-testid="ticker-symbol"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontFamily: "var(--font-mono), JetBrains Mono, monospace",
              fontSize: 12,
              fontWeight: 600,
              color: C.text,
            }}
          >
            {freshnessSource !== undefined && (
              <FreshnessDot
                lastUpdated={freshnessLastUpdated ?? null}
                source={freshnessSource ?? "finnhub"}
              />
            )}
            {symbol}
          </div>
          {label !== symbol && (
            <div
              data-testid="ticker-label"
              style={{
                fontSize: 9,
                color: C.textDim,
                fontFamily: "var(--font-mono), JetBrains Mono, monospace",
                marginTop: 1,
              }}
            >
              {label}
            </div>
          )}
        </div>

        {/* Sparkline */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <Sparkline
            data={timeseries}
            color={color}
            alert={hasAlert}
            width={160}
            height={40}
          />
        </div>

        {/* Price */}
        <div
          data-testid="ticker-price"
          style={{
            fontFamily: "var(--font-mono), JetBrains Mono, monospace",
            fontSize: 12,
            color: C.text,
            textAlign: "right",
            paddingRight: 8,
          }}
        >
          {price.toFixed(2)}
        </div>

        {/* Change */}
        <div
          data-testid="ticker-change"
          style={{
            fontFamily: "var(--font-mono), JetBrains Mono, monospace",
            fontSize: 12,
            fontWeight: 600,
            color: changeColor,
            textAlign: "right",
          }}
        >
          {changeStr}
        </div>
      </div>

      {/* Stale data badge */}
      {isStale && <StaleBadge lastSuccess={staleLastSuccess!} />}

      {/* Alert badge */}
      {alertMessage && (
        <div
          data-testid="ticker-alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            padding: "2px 0 4px 0",
            fontSize: 9,
            fontFamily: "var(--font-mono), JetBrains Mono, monospace",
            color: C.orange,
          }}
        >
          <AlertTriangle size={10} />
          {alertMessage}
        </div>
      )}
    </div>
  );
}
