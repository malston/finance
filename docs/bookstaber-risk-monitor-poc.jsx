import { useState, useEffect, useMemo, useCallback } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart, ReferenceLine, CartesianGrid } from "recharts";

// --- Color System ---
const C = {
  bg: "#0a0e17",
  panel: "#111827",
  panelBorder: "#1e293b",
  panelHover: "#151d2e",
  text: "#e2e8f0",
  textMuted: "#64748b",
  textDim: "#475569",
  green: "#22c55e",
  greenDim: "#166534",
  yellow: "#eab308",
  yellowDim: "#854d0e",
  orange: "#f97316",
  orangeDim: "#9a3412",
  red: "#ef4444",
  redDim: "#991b1b",
  blue: "#3b82f6",
  cyan: "#06b6d4",
  purple: "#a855f7",
  accent: "#f59e0b",
};

const threatColor = (level) => {
  if (level <= 25) return C.green;
  if (level <= 50) return C.yellow;
  if (level <= 75) return C.orange;
  return C.red;
};

const threatLabel = (level) => {
  if (level <= 25) return "LOW";
  if (level <= 50) return "ELEVATED";
  if (level <= 75) return "HIGH";
  return "CRITICAL";
};

// --- Simulated Data Generation ---
function generateTimeSeries(days, base, volatility, trend = 0, seed = 42) {
  let value = base;
  let s = seed;
  const data = [];
  for (let i = 0; i < days; i++) {
    s = (s * 16807 + 0) % 2147483647;
    const r = (s / 2147483647 - 0.5) * 2;
    value += r * volatility + trend;
    value = Math.max(base * 0.5, Math.min(base * 2, value));
    const date = new Date(2026, 0, 1);
    date.setDate(date.getDate() + i);
    data.push({
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      value: Math.round(value * 100) / 100,
      day: i,
    });
  }
  return data;
}

function generateCorrelationData(days, seed = 99) {
  let s = seed;
  let corr = 0.15;
  const data = [];
  for (let i = 0; i < days; i++) {
    s = (s * 16807 + 0) % 2147483647;
    const r = (s / 2147483647 - 0.5) * 2;
    // Trend correlation upward in recent weeks to simulate Bookstaber scenario
    const trendBoost = i > days * 0.7 ? 0.004 : 0;
    corr += r * 0.03 + trendBoost;
    corr = Math.max(-0.3, Math.min(0.95, corr));
    const date = new Date(2026, 0, 1);
    date.setDate(date.getDate() + i);
    data.push({
      date: `${date.getMonth() + 1}/${date.getDate()}`,
      value: Math.round(corr * 1000) / 1000,
      day: i,
    });
  }
  return data;
}

// --- Mock Ticker Data ---
const INDICATORS = {
  privateCredit: {
    label: "Private Credit Stress",
    icon: "🏦",
    description: "BDC discounts, HY spreads, redemption pressure",
    tickers: [
      { symbol: "OWL", name: "Blue Owl Capital", data: generateTimeSeries(79, 18.5, 0.6, -0.04, 42), unit: "$", alert: true, alertMsg: "Down 22% from Jan highs" },
      { symbol: "ARCC", name: "Ares Capital Corp", data: generateTimeSeries(79, 21.2, 0.3, -0.01, 88), unit: "$" },
      { symbol: "HYG", name: "iShares High Yield Bond", data: generateTimeSeries(79, 78.4, 0.4, -0.02, 123), unit: "$", alert: true, alertMsg: "Approaching 52-week low" },
      { symbol: "SPREAD", name: "HY Credit Spread", data: generateTimeSeries(79, 380, 12, 1.8, 55), unit: "bps", alert: true, alertMsg: "Widening — up 140bps YTD", inverted: true },
    ],
    threatLevel: 68,
  },
  aiConcentration: {
    label: "AI / Tech Concentration",
    icon: "🤖",
    description: "Mag-10 weight, SPY vs RSP spread, sector momentum",
    tickers: [
      { symbol: "SPY/RSP", name: "Cap-Weight vs Equal-Weight Spread", data: generateTimeSeries(79, 1.42, 0.015, -0.001, 200), unit: "ratio", alert: true, alertMsg: "Spread narrowing — concentration unwinding" },
      { symbol: "NVDA", name: "NVIDIA Corp", data: generateTimeSeries(79, 142, 5, -0.3, 300), unit: "$" },
      { symbol: "MSFT", name: "Microsoft Corp", data: generateTimeSeries(79, 410, 6, -0.15, 400), unit: "$" },
      { symbol: "SMH", name: "Semiconductor ETF", data: generateTimeSeries(79, 245, 5, -0.25, 150), unit: "$", alert: true, alertMsg: "Sector underperforming S&P by 8% MTD" },
    ],
    threatLevel: 52,
  },
  energyGeo: {
    label: "Energy & Geopolitical",
    icon: "⛽",
    description: "Crude, natural gas, shipping, Taiwan risk proxy",
    tickers: [
      { symbol: "CL=F", name: "WTI Crude Oil", data: generateTimeSeries(79, 82, 3, 0.35, 500), unit: "$", alert: true, alertMsg: "Above $105 — Strait of Hormuz disruption priced in" },
      { symbol: "NG=F", name: "Natural Gas", data: generateTimeSeries(79, 3.2, 0.15, 0.02, 600), unit: "$" },
      { symbol: "XLU", name: "Utilities Sector ETF", data: generateTimeSeries(79, 72, 1.2, 0.08, 700), unit: "$" },
      { symbol: "EWT", name: "iShares MSCI Taiwan", data: generateTimeSeries(79, 52, 1.5, -0.06, 800), unit: "$", alert: true, alertMsg: "Geopolitical risk discount widening" },
    ],
    threatLevel: 74,
  },
  contagion: {
    label: "Cross-Domain Contagion",
    icon: "🔗",
    description: "Rolling correlations across sectors, VIX, MOVE",
    tickers: [
      { symbol: "CORR", name: "BDC ↔ Tech Correlation (30d)", data: generateCorrelationData(79, 99), unit: "ρ", alert: true, alertMsg: "Correlation spiking — 0.62, up from 0.18 baseline" },
      { symbol: "VIX", name: "CBOE Volatility Index", data: generateTimeSeries(79, 18, 2.5, 0.15, 900), unit: "", alert: true, alertMsg: "Elevated — sustained above 28" },
      { symbol: "MOVE", name: "Bond Volatility Index", data: generateTimeSeries(79, 95, 4, 0.3, 950), unit: "", alert: true, alertMsg: "Bond stress rising with equity vol — unusual" },
      { symbol: "SKEW", name: "CBOE Skew Index", data: generateTimeSeries(79, 135, 3, 0.1, 111), unit: "" },
    ],
    threatLevel: 61,
  },
};

// --- Components ---

function ThreatGauge({ level, size = 140 }) {
  const color = threatColor(level);
  const label = threatLabel(level);
  const circumference = 2 * Math.PI * 54;
  const dashOffset = circumference - (level / 100) * circumference * 0.75;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <svg width={size} height={size * 0.7} viewBox="0 0 120 84">
        <path d="M 6 78 A 54 54 0 0 1 114 78" fill="none" stroke={C.panelBorder} strokeWidth="8" strokeLinecap="round" />
        <path
          d="M 6 78 A 54 54 0 0 1 114 78"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${circumference * 0.75}`}
          strokeDashoffset={dashOffset}
          style={{ filter: `drop-shadow(0 0 6px ${color}80)`, transition: "stroke-dashoffset 1s ease" }}
        />
        <text x="60" y="58" textAnchor="middle" fill={color} fontSize="22" fontWeight="700" fontFamily="'JetBrains Mono', monospace">
          {level}
        </text>
        <text x="60" y="76" textAnchor="middle" fill={C.textMuted} fontSize="9" fontFamily="'JetBrains Mono', monospace" letterSpacing="1.5">
          {label}
        </text>
      </svg>
    </div>
  );
}

function Sparkline({ data, color, height = 40, alert: isAlert }) {
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 160;
  const h = height;
  const points = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.value - min) / range) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const areaPoints = `0,${h} ${points.join(" ")} ${w},${h}`;
  const lastVal = values[values.length - 1];

  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`grad-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${color.replace("#", "")})`} />
      <polyline points={points.join(" ")} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx={w} cy={parseFloat(points[points.length - 1].split(",")[1])} r="3" fill={color} style={isAlert ? { filter: `drop-shadow(0 0 4px ${color})` } : {}} />
    </svg>
  );
}

function TickerRow({ ticker, color }) {
  const latest = ticker.data[ticker.data.length - 1].value;
  const prev = ticker.data[ticker.data.length - 2].value;
  const change = latest - prev;
  const changePct = ((change / prev) * 100).toFixed(2);
  const isUp = change >= 0;
  const isInverted = ticker.inverted;
  const changeColor = isInverted ? (isUp ? C.red : C.green) : isUp ? C.green : C.red;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "90px 1fr 160px 80px",
        alignItems: "center",
        padding: "10px 12px",
        borderBottom: `1px solid ${C.panelBorder}`,
        gap: 8,
      }}
    >
      <div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 600, color: ticker.alert ? C.accent : C.text }}>{ticker.symbol}</div>
        <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>{ticker.name}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Sparkline data={ticker.data} color={color} alert={ticker.alert} />
        {ticker.alert && <div style={{ fontSize: 9, color: C.orange, fontFamily: "'JetBrains Mono', monospace", paddingLeft: 2 }}>⚠ {ticker.alertMsg}</div>}
      </div>
      <div style={{ textAlign: "right" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: C.text }}>
          {ticker.unit === "$" ? "$" : ""}
          {latest.toLocaleString()}
          {ticker.unit === "bps" ? " bps" : ticker.unit === "ρ" ? "" : ""}
        </span>
      </div>
      <div style={{ textAlign: "right" }}>
        <span
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 12,
            color: changeColor,
            background: `${changeColor}15`,
            padding: "2px 6px",
            borderRadius: 3,
          }}
        >
          {isUp ? "+" : ""}
          {changePct}%
        </span>
      </div>
    </div>
  );
}

function SectorPanel({ sectorKey, sector, isActive, onToggle }) {
  const colors = {
    privateCredit: C.orange,
    aiConcentration: C.purple,
    energyGeo: C.cyan,
    contagion: C.red,
  };
  const color = colors[sectorKey];

  return (
    <div
      style={{
        background: C.panel,
        border: `1px solid ${isActive ? color + "60" : C.panelBorder}`,
        borderRadius: 8,
        overflow: "hidden",
        transition: "border-color 0.3s ease",
      }}
    >
      <div
        onClick={onToggle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 16px",
          cursor: "pointer",
          background: isActive ? `${color}08` : "transparent",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>{sector.icon}</span>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>{sector.label}</div>
            <div style={{ fontSize: 11, color: C.textDim, marginTop: 1 }}>{sector.description}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <ThreatGauge level={sector.threatLevel} size={90} />
          <span
            style={{
              color: C.textDim,
              fontSize: 18,
              transform: isActive ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 0.2s ease",
            }}
          >
            ▾
          </span>
        </div>
      </div>
      {isActive && (
        <div style={{ borderTop: `1px solid ${C.panelBorder}` }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "90px 1fr 160px 80px",
              padding: "8px 12px",
              fontSize: 9,
              color: C.textDim,
              fontFamily: "'JetBrains Mono', monospace",
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            <div>Ticker</div>
            <div>79-Day Trend</div>
            <div style={{ textAlign: "right" }}>Last</div>
            <div style={{ textAlign: "right" }}>Chg</div>
          </div>
          {sector.tickers.map((t) => (
            <TickerRow key={t.symbol} ticker={t} color={color} />
          ))}
        </div>
      )}
    </div>
  );
}

function ContagionChart() {
  const corrData = INDICATORS.contagion.tickers[0].data;
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 8, padding: "16px 16px 8px 8px" }}>
      <div style={{ padding: "0 8px 12px", display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Cross-Domain Correlation Monitor</div>
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 2 }}>BDC ↔ Big Tech 30-day rolling correlation — above 0.5 signals contagion</div>
        </div>
        <div
          style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: 18,
            fontWeight: 700,
            color: corrData[corrData.length - 1].value > 0.5 ? C.red : C.yellow,
          }}
        >
          ρ = {corrData[corrData.length - 1].value.toFixed(3)}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <AreaChart data={corrData} margin={{ top: 4, right: 8, bottom: 0, left: 8 }}>
          <defs>
            <linearGradient id="corrGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.red} stopOpacity={0.3} />
              <stop offset="100%" stopColor={C.red} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={C.panelBorder} />
          <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.textDim }} tickLine={false} interval={14} />
          <YAxis domain={[-0.2, 1]} tick={{ fontSize: 9, fill: C.textDim }} tickLine={false} axisLine={false} />
          <ReferenceLine y={0.5} stroke={C.red} strokeDasharray="4 4" strokeOpacity={0.6} label={{ value: "CONTAGION THRESHOLD", fill: C.red, fontSize: 8, position: "right" }} />
          <ReferenceLine y={0} stroke={C.textDim} strokeDasharray="2 2" strokeOpacity={0.3} />
          <Tooltip
            contentStyle={{ background: C.panel, border: `1px solid ${C.panelBorder}`, borderRadius: 6, fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}
            labelStyle={{ color: C.textMuted, fontSize: 10 }}
            itemStyle={{ color: C.text }}
            formatter={(v) => [v.toFixed(3), "Correlation"]}
          />
          <Area type="monotone" dataKey="value" stroke={C.red} fill="url(#corrGrad)" strokeWidth={2} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompositeThreat() {
  const levels = Object.values(INDICATORS).map((s) => s.threatLevel);
  const composite = Math.round(levels.reduce((a, b) => a + b, 0) / levels.length);
  const weights = [
    { key: "privateCredit", label: "Credit", w: 0.3 },
    { key: "aiConcentration", label: "AI Conc.", w: 0.2 },
    { key: "energyGeo", label: "Energy/Geo", w: 0.25 },
    { key: "contagion", label: "Contagion", w: 0.25 },
  ];
  const weighted = Math.round(weights.reduce((acc, w) => acc + INDICATORS[w.key].threatLevel * w.w, 0));

  return (
    <div
      style={{
        background: `linear-gradient(135deg, ${C.panel} 0%, ${threatColor(weighted)}10 100%)`,
        border: `1px solid ${threatColor(weighted)}40`,
        borderRadius: 10,
        padding: "20px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: 16,
      }}
    >
      <div>
        <div style={{ fontSize: 10, color: C.textDim, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>
          Composite Systemic Risk
        </div>
        <div style={{ fontSize: 32, fontWeight: 800, fontFamily: "'JetBrains Mono', monospace", color: threatColor(weighted), lineHeight: 1 }}>
          {weighted}
          <span style={{ fontSize: 14, color: C.textMuted, fontWeight: 400 }}> / 100</span>
        </div>
        <div
          style={{
            marginTop: 6,
            fontSize: 11,
            color: threatColor(weighted),
            fontFamily: "'JetBrains Mono', monospace",
            fontWeight: 600,
            letterSpacing: 1,
          }}
        >
          ● THREAT LEVEL: {threatLabel(weighted)}
        </div>
      </div>
      <div style={{ display: "flex", gap: 20 }}>
        {weights.map((w) => (
          <div key={w.key} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 9, color: C.textDim, fontFamily: "'JetBrains Mono', monospace", marginBottom: 4, letterSpacing: 0.5 }}>{w.label}</div>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 14,
                fontWeight: 700,
                color: threatColor(INDICATORS[w.key].threatLevel),
                border: `2px solid ${threatColor(INDICATORS[w.key].threatLevel)}50`,
                background: `${threatColor(INDICATORS[w.key].threatLevel)}10`,
              }}
            >
              {INDICATORS[w.key].threatLevel}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataSourcesNote() {
  return (
    <div style={{ background: `${C.blue}08`, border: `1px solid ${C.blue}25`, borderRadius: 8, padding: "14px 16px", marginTop: 8 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.blue, marginBottom: 6 }}>📡 Wiring This Up to Live Data</div>
      <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.6 }}>
        This prototype uses simulated data. To go live, connect: <strong style={{ color: C.text }}>Yahoo Finance / Polygon.io</strong> for equities & ETFs,{" "}
        <strong style={{ color: C.text }}>FRED API</strong> for credit spreads & macro, <strong style={{ color: C.text }}>Finnhub</strong> for real-time websocket feeds. The
        correlation engine would run as a scheduled job computing 30-day rolling Pearson coefficients across the BDC, tech, and energy price series. A Go or Python backend
        polling on a 5-min cron fits this well.
      </div>
    </div>
  );
}

// --- Main App ---

export default function BookstaberRiskMonitor() {
  const [activePanels, setActivePanels] = useState({ privateCredit: true, contagion: false, aiConcentration: false, energyGeo: false });
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  const toggle = useCallback(
    (key) => {
      setActivePanels((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    []
  );

  return (
    <div
      style={{
        background: C.bg,
        minHeight: "100vh",
        fontFamily: "'IBM Plex Sans', -apple-system, sans-serif",
        color: C.text,
        padding: "0 0 40px",
      }}
    >
      <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700;800&display=swap" rel="stylesheet" />

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
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>◈</span>
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>BOOKSTABER RISK MONITOR</span>
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 3, fontFamily: "'JetBrains Mono', monospace" }}>Systemic contagion tracker — Private Credit × AI × Energy × Geopolitical</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: C.textMuted }}>
            {time.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: C.textDim, marginTop: 2 }}>
            {time.toLocaleTimeString()} MST
          </div>
          <div style={{ fontSize: 9, color: C.orange, fontFamily: "'JetBrains Mono', monospace", marginTop: 3 }}>◉ SIMULATED DATA — PROTOTYPE</div>
        </div>
      </div>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Composite Threat */}
        <CompositeThreat />

        {/* Contagion Chart — the key signal */}
        <ContagionChart />

        {/* Sector Panels */}
        {Object.entries(INDICATORS).map(([key, sector]) => (
          <SectorPanel key={key} sectorKey={key} sector={sector} isActive={activePanels[key]} onToggle={() => toggle(key)} />
        ))}

        {/* Legend */}
        <div style={{ display: "flex", gap: 20, justifyContent: "center", padding: "8px 0", flexWrap: "wrap" }}>
          {[
            { color: C.green, label: "LOW (0–25)" },
            { color: C.yellow, label: "ELEVATED (26–50)" },
            { color: C.orange, label: "HIGH (51–75)" },
            { color: C.red, label: "CRITICAL (76–100)" },
          ].map((l) => (
            <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 10, color: C.textDim, fontFamily: "'JetBrains Mono', monospace" }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color, boxShadow: `0 0 4px ${l.color}60` }} />
              {l.label}
            </div>
          ))}
        </div>

        {/* Data Sources */}
        <DataSourcesNote />
      </div>
    </div>
  );
}
