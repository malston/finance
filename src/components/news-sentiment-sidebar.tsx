"use client";

import { useState, useEffect, useCallback } from "react";
import { C } from "@/lib/theme";
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

const REFRESH_INTERVAL_MS = 60_000;

async function fetchNews(domain: string, limit = 20): Promise<NewsHeadline[]> {
  try {
    const res = await fetch(`/api/risk/news?domain=${domain}&limit=${limit}`);
    if (!res.ok) return [];
    return res.json();
  } catch {
    const empty: NewsHeadline[] = [];
    return empty;
  }
}

async function fetchDomainSentiment(ticker: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/risk/timeseries?ticker=${ticker}&days=1`);
    if (!res.ok) return null;
    const rows: TimeSeriesRow[] = await res.json();
    if (rows.length === 0) return null;
    return rows[rows.length - 1].value;
  } catch {
    const noData: number | null = null;
    return noData;
  }
}

export function NewsSentimentSidebar() {
  const [activeDomain, setActiveDomain] = useState(0);
  const [headlines, setHeadlines] = useState<Record<string, NewsHeadline[]>>(
    {},
  );
  const [aggregates, setAggregates] = useState<Record<string, number | null>>(
    {},
  );
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const refreshData = useCallback(async () => {
    const newsPromises = DOMAINS.map((d) =>
      fetchNews(d.key).then((data) => [d.key, data] as const),
    );
    const sentimentPromises = DOMAINS.map((d) =>
      fetchDomainSentiment(d.ticker).then((val) => [d.key, val] as const),
    );

    const newsResults = await Promise.all(newsPromises);
    const sentimentResults = await Promise.all(sentimentPromises);

    const newHeadlines: Record<string, NewsHeadline[]> = {};
    for (const [key, data] of newsResults) {
      newHeadlines[key] = data;
    }

    const newAggregates: Record<string, number | null> = {};
    for (const [key, val] of sentimentResults) {
      newAggregates[key] = val;
    }

    setHeadlines(newHeadlines);
    setAggregates(newAggregates);
    setLastRefresh(new Date());
  }, []);

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshData]);

  const domain = DOMAINS[activeDomain];
  const domainHeadlines = headlines[domain.key] ?? [];
  const domainAggregate = aggregates[domain.key] ?? null;

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
          {lastRefresh && (
            <span
              data-testid="refresh-timestamp"
              style={{
                fontSize: 9,
                color: C.textDim,
                fontFamily: "var(--font-mono)",
              }}
            >
              {lastRefresh.toLocaleTimeString()}
            </span>
          )}
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
        {domainHeadlines.length === 0 ? (
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
