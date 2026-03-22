"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { C } from "@/lib/theme";
import { useFramework } from "@/lib/framework-context";
import type { Framework } from "@/lib/framework-config";
import {
  DOMAINS,
  sentimentBgColor,
  sentimentTextColor,
  sentimentLabel,
  formatRelativeTime,
} from "@/lib/sentiment";

interface NewsHeadline {
  time: string;
  domain: string;
  headline: string;
  sentiment: number;
  source_name: string;
  source_url: string;
}

interface TimeSeriesRow {
  time: string;
  ticker: string;
  value: number;
  source: string;
}

async function fetchAllNews(
  framework: Framework,
): Promise<Record<string, NewsHeadline[]>> {
  const results = await Promise.all(
    DOMAINS.map(async (d) => {
      const res = await fetch(
        `/api/risk/news?domain=${d.key}&limit=20&framework=${framework}`,
      );
      if (!res.ok)
        throw new Error(`News fetch failed for ${d.key}: ${res.status}`);
      const data: NewsHeadline[] = await res.json();
      return [d.key, data] as const;
    }),
  );

  const headlines: Record<string, NewsHeadline[]> = {};
  for (const [key, data] of results) {
    headlines[key] = data as NewsHeadline[];
  }
  return headlines;
}

async function fetchAllSentiments(): Promise<Record<string, number | null>> {
  const results = await Promise.all(
    DOMAINS.map(async (d) => {
      const res = await fetch(`/api/risk/timeseries?ticker=${d.ticker}&days=1`);
      if (!res.ok)
        throw new Error(
          `Sentiment fetch failed for ${d.ticker}: ${res.status}`,
        );
      const rows: TimeSeriesRow[] = await res.json();
      if (rows.length === 0) return [d.key, null] as const;
      return [d.key, rows[rows.length - 1].value] as const;
    }),
  );

  const aggregates: Record<string, number | null> = {};
  for (const [key, val] of results) {
    aggregates[key] = val;
  }
  return aggregates;
}

export function NewsSentimentSidebar() {
  const [activeDomain, setActiveDomain] = useState(0);
  const { framework } = useFramework();

  const { data: headlines, isError: isHeadlinesError } = useQuery<
    Record<string, NewsHeadline[]>
  >({
    queryKey: ["news-headlines", framework],
    queryFn: () => fetchAllNews(framework),
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  const { data: aggregates, isError: isSentimentsError } = useQuery<
    Record<string, number | null>
  >({
    queryKey: ["news-sentiments"],
    queryFn: fetchAllSentiments,
    refetchInterval: 60_000,
    staleTime: 55_000,
  });

  const domain = DOMAINS[activeDomain];
  const domainHeadlines = headlines?.[domain.key] ?? [];
  const domainAggregate = aggregates?.[domain.key] ?? null;

  return (
    <div
      data-testid="news-sentiment-sidebar"
      style={{
        background: C.panel,
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        width: 320,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "12px 14px 8px",
          borderBottom: `1px solid ${C.panelBorder}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
            News Sentiment
          </span>
        </div>
      </div>

      {/* Domain tabs */}
      <div
        role="tablist"
        style={{
          display: "flex",
          borderBottom: `1px solid ${C.panelBorder}`,
        }}
      >
        {DOMAINS.map((d, i) => (
          <button
            key={d.key}
            role="tab"
            aria-selected={i === activeDomain}
            onClick={() => setActiveDomain(i)}
            style={{
              flex: 1,
              padding: "8px 4px",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              background: i === activeDomain ? C.panelBorder : "transparent",
              color: i === activeDomain ? C.text : C.textDim,
              border: "none",
              cursor: "pointer",
              borderBottom:
                i === activeDomain
                  ? `2px solid ${C.accent}`
                  : "2px solid transparent",
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* Domain aggregate badge */}
      {domainAggregate !== null && (
        <div style={{ padding: "8px 14px 4px" }}>
          <span
            data-testid="domain-sentiment-badge"
            style={{
              display: "inline-block",
              padding: "2px 8px",
              borderRadius: 10,
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              fontWeight: 600,
              backgroundColor: sentimentBgColor(domainAggregate),
              color: sentimentTextColor(domainAggregate),
            }}
          >
            {sentimentLabel(domainAggregate)}
          </span>
        </div>
      )}

      {/* Headlines list */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "4px 0",
          maxHeight: 400,
        }}
      >
        {isHeadlinesError || isSentimentsError ? (
          <div
            data-testid="news-error-indicator"
            style={{
              padding: "24px 14px",
              textAlign: "center",
              fontSize: 12,
              color: C.orange,
            }}
          >
            Unable to load headlines
          </div>
        ) : domainHeadlines.length === 0 ? (
          <div
            style={{
              padding: "24px 14px",
              textAlign: "center",
              fontSize: 12,
              color: C.textDim,
            }}
          >
            No recent headlines
          </div>
        ) : (
          domainHeadlines.map((item, i) => (
            <div
              key={`${item.time}-${i}`}
              style={{
                padding: "8px 14px",
                borderBottom: `1px solid ${C.panelBorder}`,
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  color: C.text,
                  fontFamily: "var(--font-sans)",
                  lineHeight: 1.4,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
              >
                {item.headline}
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 4,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "1px 6px",
                    borderRadius: 8,
                    fontSize: 10,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 500,
                    backgroundColor: sentimentBgColor(item.sentiment),
                    color: sentimentTextColor(item.sentiment),
                  }}
                >
                  {sentimentLabel(item.sentiment)}
                </span>
                <span style={{ fontSize: 10, color: C.textMuted }}>
                  {item.source_name}
                </span>
                <span style={{ fontSize: 10, color: C.textMuted }}>
                  {formatRelativeTime(item.time)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
