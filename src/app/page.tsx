"use client";

import { useState, useEffect } from "react";
import { C } from "@/lib/theme";
import { HYCreditSpreadCard } from "@/components/hy-credit-card";
import { TreasuryCreditCard } from "@/components/treasury-credit-card";
import { EquityEtfCard } from "@/components/equity-etf-card";
import { SectorPanels } from "@/components/risk/sector-panels";
import { NewsSentimentSidebar } from "@/components/news-sentiment-sidebar";
import { CorrelationChart } from "@/components/risk/correlation-chart";

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
      <div
        style={{
          fontSize: 9,
          color: C.orange,
          fontFamily: "var(--font-mono)",
          marginTop: 3,
        }}
      >
        ◉ SIMULATED DATA — PROTOTYPE
      </div>
    </div>
  );
}

export default function DashboardPage() {
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
            <span style={{ fontSize: 22 }}>◈</span>
            <span
              style={{
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "-0.02em",
              }}
            >
              BOOKSTABER RISK MONITOR
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
            Systemic contagion tracker — Private Credit × AI × Energy ×
            Geopolitical
          </div>
        </div>
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
          <div
            data-testid="section-composite-threat"
            style={{
              background: C.panel,
              border: `1px solid ${C.panelBorder}`,
              borderRadius: 10,
              padding: "20px 24px",
              minHeight: 100,
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: C.textDim,
                fontFamily: "var(--font-mono)",
                letterSpacing: 2,
                textTransform: "uppercase",
              }}
            >
              Composite Systemic Risk
            </div>
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
          <div
            style={{
              display: "flex",
              gap: 20,
              justifyContent: "center",
              padding: "8px 0",
              flexWrap: "wrap",
            }}
          >
            {[
              { color: C.green, label: "LOW (0–25)" },
              { color: C.yellow, label: "ELEVATED (26–50)" },
              { color: C.orange, label: "HIGH (51–75)" },
              { color: C.red, label: "CRITICAL (76–100)" },
            ].map((l) => (
              <div
                key={l.label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 10,
                  color: C.textDim,
                  fontFamily: "var(--font-mono)",
                }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: l.color,
                    boxShadow: `0 0 4px ${l.color}60`,
                  }}
                />
                {l.label}
              </div>
            ))}
          </div>
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
