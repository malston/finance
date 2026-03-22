"use client";

import { useQuery } from "@tanstack/react-query";
import { C } from "@/lib/theme";
import { useFramework } from "@/lib/framework-context";
import { isScoreAged, formatScoreTimestamp } from "@/lib/format-score-age";

interface CompositeData {
  score: number | null;
  level: string | null;
  color: string | null;
}

interface DomainData {
  score: number | null;
  weight: number;
  level: string | null;
  color: string | null;
}

interface ScoresResponse {
  composite: CompositeData;
  domains: Record<string, DomainData>;
  updated_at: string | null;
  stale?: boolean;
  message?: string;
}

const DOMAIN_LABELS: Record<string, string> = {
  private_credit: "Credit",
  ai_concentration: "AI Conc.",
  energy_geo: "Energy/Geo",
  contagion: "Contagion",
};

const DOMAIN_ORDER = [
  "private_credit",
  "ai_concentration",
  "energy_geo",
  "contagion",
];

export function CompositeScore() {
  const { framework } = useFramework();
  const { data, isLoading, isError } = useQuery<ScoresResponse>({
    queryKey: ["risk-scores", framework],
    queryFn: async () => {
      const res = await fetch(`/api/risk/scores?framework=${framework}`);
      if (!res.ok) throw new Error("Failed to fetch risk scores");
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const composite = data?.composite;
  const domains = data?.domains;
  const score = composite?.score;
  const level = composite?.level;
  const color = composite?.color ?? C.textMuted;

  const rootStyle =
    isLoading || isError
      ? {
          background: C.panel,
          border: `1px solid ${C.panelBorder}`,
          borderRadius: 10,
          padding: "20px 24px",
          minHeight: 100,
        }
      : {
          background: `linear-gradient(135deg, ${C.panel} 0%, ${color}10 100%)`,
          border: `1px solid ${color}40`,
          borderRadius: 10,
          padding: "20px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap" as const,
          gap: 16,
          minHeight: 100,
        };

  return (
    <div data-testid="composite-score" style={rootStyle}>
      {isLoading && (
        <div data-testid="composite-score-loading">
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
          <div
            style={{
              color: C.textMuted,
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              marginTop: 12,
            }}
          >
            Loading...
          </div>
        </div>
      )}

      {isError && (
        <div data-testid="composite-score-error">
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
          <div
            style={{
              color: C.red,
              fontFamily: "var(--font-mono)",
              fontSize: 12,
              marginTop: 12,
            }}
          >
            Failed to load scores. Check your connection and refresh.
          </div>
        </div>
      )}

      {!isLoading && !isError && (
        <>
          <div>
            <div
              style={{
                fontSize: 10,
                color: C.textDim,
                fontFamily: "var(--font-mono)",
                letterSpacing: 2,
                textTransform: "uppercase",
                marginBottom: 4,
              }}
            >
              Composite Systemic Risk
            </div>
            <div
              data-testid="composite-score-value"
              style={{
                fontSize: 32,
                fontWeight: 800,
                fontFamily: "var(--font-mono)",
                color,
                lineHeight: 1,
              }}
            >
              {score !== null && score !== undefined ? Math.round(score) : "--"}
              <span
                style={{ fontSize: 14, color: C.textMuted, fontWeight: 400 }}
              >
                {" "}
                / 100
              </span>
            </div>
            <div
              data-testid="composite-threat-level"
              style={{
                marginTop: 6,
                fontSize: 11,
                color,
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
                letterSpacing: 1,
              }}
            >
              {level ? `● THREAT LEVEL: ${level}` : "● THREAT LEVEL: --"}
            </div>
            {data?.updated_at && isScoreAged(data.updated_at) && (
              <div
                data-testid="composite-score-age"
                style={{
                  fontSize: 10,
                  color: C.textDim,
                  fontFamily: "var(--font-mono)",
                  marginTop: 2,
                }}
              >
                {formatScoreTimestamp(data.updated_at)}
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 20 }}>
            {DOMAIN_ORDER.map((key) => {
              const domain = domains?.[key];
              const domainColor = domain?.color ?? C.textMuted;
              const domainScore = domain?.score;
              return (
                <div key={key} style={{ textAlign: "center" }}>
                  <div
                    style={{
                      fontSize: 9,
                      color: C.textDim,
                      fontFamily: "var(--font-mono)",
                      marginBottom: 4,
                      letterSpacing: 0.5,
                    }}
                  >
                    {DOMAIN_LABELS[key]}
                  </div>
                  <div
                    data-testid={`domain-badge-${key}`}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontFamily: "var(--font-mono)",
                      fontSize: 14,
                      fontWeight: 700,
                      color: domainColor,
                      border: `2px solid ${domainColor}50`,
                      background: `${domainColor}10`,
                    }}
                  >
                    {domainScore !== null && domainScore !== undefined
                      ? Math.round(domainScore)
                      : "--"}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
