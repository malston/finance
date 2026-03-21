"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Building2,
  Cpu,
  Fuel,
  Link,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { C } from "@/lib/theme";
import type { DomainConfig } from "@/lib/domain-config";
import { useSourceHealth } from "@/hooks/use-source-health";
import { useFreshness } from "@/hooks/use-freshness";
import { ThreatGauge } from "./threat-gauge";
import { TickerRow } from "./ticker-row";

interface ScoresResponse {
  composite: {
    score: number | null;
    level: string | null;
    color: string | null;
  };
  domains: Record<
    string,
    {
      score: number | null;
      weight: number;
      level: string | null;
      color: string | null;
    }
  >;
  updated_at: string | null;
}

interface TimeSeriesRow {
  time: string;
  ticker: string;
  value: number;
  source: string;
}

const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  building2: Building2,
  cpu: Cpu,
  fuel: Fuel,
  link: Link,
};

interface SectorPanelProps {
  domain: DomainConfig;
  defaultExpanded?: boolean;
}

export function SectorPanel({
  domain,
  defaultExpanded = false,
}: SectorPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const { isTickerStale, getTickerStaleness } = useSourceHealth();
  const { getTickerFreshness } = useFreshness();

  const { data: scores } = useQuery<ScoresResponse>({
    queryKey: ["risk-scores"],
    queryFn: async () => {
      const res = await fetch("/api/risk/scores");
      if (!res.ok) throw new Error("Failed to fetch scores");
      return res.json();
    },
    staleTime: 30_000,
  });

  const domainScore = scores?.domains[domain.scoreKey];
  const score = domainScore?.score ?? 0;
  const scoreColor = domainScore?.color ?? domain.color;

  const { data: tickerData } = useQuery<Record<string, TimeSeriesRow[]>>({
    queryKey: ["sector-timeseries", domain.scoreKey],
    queryFn: async () => {
      const results: Record<string, TimeSeriesRow[]> = {};
      await Promise.all(
        domain.tickers.map(async (t) => {
          const res = await fetch(
            `/api/risk/timeseries?ticker=${encodeURIComponent(t.symbol)}&days=79`,
          );
          if (res.ok) {
            results[t.symbol] = await res.json();
          }
        }),
      );
      return results;
    },
    enabled: expanded,
    staleTime: 60_000,
  });

  const Icon = ICON_MAP[domain.icon];
  const ArrowIcon = expanded ? ChevronUp : ChevronDown;
  const hasStaleTicker = domain.tickers.some((t) => isTickerStale(t.symbol));

  return (
    <div
      data-testid="sector-panel"
      style={{
        background: C.panel,
        border: `1px solid ${expanded ? `${domain.color}60` : C.panelBorder}`,
        borderColor: expanded ? `${domain.color}60` : C.panelBorder,
        borderRadius: 8,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        data-testid="sector-panel-header"
        onClick={() => setExpanded(!expanded)}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "14px 16px",
          cursor: "pointer",
          background: expanded ? `${domain.color}08` : "transparent",
        }}
      >
        <div
          style={{ display: "flex", alignItems: "center", gap: 10, flex: 1 }}
        >
          <div data-testid="sector-panel-icon" style={{ color: domain.color }}>
            {Icon && <Icon size={18} />}
          </div>
          <div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 14,
                fontWeight: 600,
                color: C.text,
              }}
            >
              {domain.name}
              {hasStaleTicker && (
                <span
                  data-testid="domain-stale-warning"
                  style={{ color: C.orange }}
                >
                  <AlertTriangle size={14} />
                </span>
              )}
            </div>
            <div
              style={{
                fontSize: 11,
                color: C.textDim,
                marginTop: 1,
              }}
            >
              {domain.description}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ThreatGauge score={score} color={scoreColor} size={90} />
          <div
            data-testid="sector-panel-collapse-arrow"
            style={{ color: C.textMuted }}
          >
            <ArrowIcon size={16} />
          </div>
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div
          data-testid="sector-ticker-table"
          style={{ padding: "0 16px 14px" }}
        >
          {/* Column headers */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr 160px 80px",
              padding: "6px 0",
              borderBottom: `1px solid ${C.panelBorder}`,
            }}
          >
            {["TICKER", "79-DAY TREND", "LAST", "CHG"].map((h) => (
              <div
                key={h}
                style={{
                  fontSize: 9,
                  fontFamily: "var(--font-mono), JetBrains Mono, monospace",
                  color: C.textDim,
                  textTransform: "uppercase",
                  letterSpacing: 1,
                  textAlign: h === "LAST" || h === "CHG" ? "right" : "left",
                  paddingRight: h === "LAST" ? 8 : 0,
                }}
              >
                {h}
              </div>
            ))}
          </div>

          {/* Ticker rows */}
          {domain.tickers.map((ticker) => {
            const series = tickerData?.[ticker.symbol] ?? [];
            const values = series.map((r) => r.value);
            const latest =
              series.length > 0 ? series[series.length - 1].value : 0;
            const prev =
              series.length > 1 ? series[series.length - 2].value : latest;
            const change = prev !== 0 ? ((latest - prev) / prev) * 100 : 0;

            const staleness = getTickerStaleness(ticker.symbol);
            const staleLastSuccess = staleness?.stale
              ? staleness.last_success
              : undefined;

            const freshness = getTickerFreshness(ticker.symbol);

            return (
              <TickerRow
                key={ticker.symbol}
                symbol={ticker.symbol}
                label={ticker.label}
                price={latest}
                change={change}
                timeseries={values}
                color={domain.color}
                inverted={ticker.inverted}
                staleLastSuccess={staleLastSuccess}
                freshnessLastUpdated={freshness?.last_updated}
                freshnessSource={freshness?.source}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
