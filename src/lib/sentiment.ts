/**
 * Sentiment color coding and formatting utilities for the news sentiment sidebar.
 */

export interface DomainConfig {
  key: string;
  label: string;
  ticker: string;
}

export const DOMAINS: DomainConfig[] = [
  {
    key: "private_credit",
    label: "Private Credit",
    ticker: "SENTIMENT_PRIVATE_CREDIT",
  },
  { key: "ai_tech", label: "AI / Tech", ticker: "SENTIMENT_AI_TECH" },
  {
    key: "energy_geo",
    label: "Energy / Geo",
    ticker: "SENTIMENT_ENERGY_GEO",
  },
  {
    key: "geopolitical",
    label: "Geopolitical",
    ticker: "SENTIMENT_GEOPOLITICAL",
  },
];

/**
 * Returns the background color for a sentiment pill.
 * Positive (> 0.2): green, Neutral (-0.2 to 0.2): yellow, Negative (< -0.2): red
 */
export function sentimentBgColor(sentiment: number): string {
  if (sentiment > 0.2) return "#22c55e";
  if (sentiment < -0.2) return "#ef4444";
  return "#eab308";
}

/**
 * Returns the text color for a sentiment pill.
 */
export function sentimentTextColor(sentiment: number): string {
  if (sentiment > 0.2) return "#dcfce7";
  if (sentiment < -0.2) return "#fecaca";
  return "#fef9c3";
}

/**
 * Formats a sentiment score as a signed string with 2 decimal places.
 */
export function sentimentLabel(sentiment: number): string {
  if (sentiment > 0) return `+${sentiment.toFixed(2)}`;
  return sentiment.toFixed(2);
}

/**
 * Formats an ISO timestamp as a relative time string (e.g., "2h ago", "5m ago").
 */
export function formatRelativeTime(isoTimestamp: string): string {
  const now = Date.now();
  const then = new Date(isoTimestamp).getTime();
  const diffSeconds = Math.floor((now - then) / 1000);

  if (diffSeconds < 60) return "just now";

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
