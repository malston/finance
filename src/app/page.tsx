"use client";

import { useState, useEffect } from "react";
import { C } from "@/lib/theme";
import { FrameworkProvider, useFramework } from "@/lib/framework-context";
import { FrameworkToggle } from "@/components/risk/framework-toggle";
import { HYCreditSpreadCard } from "@/components/hy-credit-card";
import { TreasuryCreditCard } from "@/components/treasury-credit-card";
import { EquityEtfCard } from "@/components/equity-etf-card";
import { SectorPanels } from "@/components/risk/sector-panels";
import { NewsSentimentSidebar } from "@/components/news-sentiment-sidebar";
import { CorrelationChart } from "@/components/risk/correlation-chart";
import { CompositeScore } from "@/components/risk/composite-score";
import { ThreatLegend } from "@/components/risk/threat-legend";

const HEADER_TEXT = {
  bookstaber: {
    title: "BOOKSTABER RISK MONITOR",
    subtitle:
      "Systemic contagion tracker \u2014 Private Credit \u00d7 AI \u00d7 Energy \u00d7 Geopolitical",
  },
  yardeni: {
    title: "YARDENI RESILIENCE MONITOR",
    subtitle:
      "Resilience monitor \u2014 tracking self-correction across risk domains",
  },
} as const;

function HeaderClock() {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div style={{ textAlign: "right" }}>
      <div
        data-testid="header-date"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 13,
          color: C.textMuted,
        }}
      >
        {time.toLocaleDateString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
      </div>
      <div
        data-testid="header-time"
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: C.textDim,
          marginTop: 2,
        }}
      >
        {time.toLocaleTimeString()}
      </div>
    </div>
  );
}

function DashboardContent() {
  const { framework } = useFramework();
  const header = HEADER_TEXT[framework];

  return (
    <div
      data-testid="dashboard-root"
      style={{
        backgroundColor: C.bg,
        minHeight: "100vh",
        color: C.text,
        padding: "0 0 40px",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: `linear-gradient(180deg, ${C.panel} 0%, ${C.bg} 100%)`,
          borderBottom: `1px solid ${C.panelBorder}`,
          padding: "16px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ fontSize: 22 }}>{"\u25C8"}</span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              {header.title}
            </span>
          </div>
          <div
            style={{
              fontSize: 11,
              color: C.textDim,
              marginTop: 3,
              fontFamily: "var(--font-mono)",
            }}
          >
            {header.subtitle}
          </div>
        </div>
        <FrameworkToggle />
        <HeaderClock />
      </div>

      {/* Main content area with sidebar */}
      <div
        style={{
          display: "flex",
          maxWidth: "1320px",
          margin: "0 auto",
          padding: "20px 16px",
          gap: 16,
        }}
      >
        {/* Cards column */}
        <div
          data-testid="dashboard-content"
          style={{
            flex: 1,
            minWidth: 0,
            maxWidth: "960px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {/* Composite Threat */}
          <div data-testid="section-composite-threat">
            <CompositeScore />
          </div>

          {/* Correlation Chart */}
          <div data-testid="section-correlation-chart">
            <CorrelationChart />
          </div>

          {/* Sector Panels */}
          <div data-testid="section-sector-panels">
            <HYCreditSpreadCard />
            <TreasuryCreditCard />
            <EquityEtfCard />
            <SectorPanels />
          </div>

          {/* Legend */}
          <ThreatLegend />
        </div>

        {/* News Sentiment Sidebar (desktop) */}
        <div
          data-testid="news-sidebar-desktop"
          style={{ flexShrink: 0 }}
          className="news-sidebar-desktop"
        >
          <NewsSentimentSidebar />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <FrameworkProvider>
      <DashboardContent />
    </FrameworkProvider>
  );
}
