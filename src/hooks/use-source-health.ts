import { useQuery } from "@tanstack/react-query";
import {
  getSourceForTicker,
  type SourceHealthResponse,
  type SourceStatus,
} from "@/lib/source-health";

export type OverallStatus = "healthy" | "degraded" | "down" | "unknown";

interface SourceHealthResult {
  sources: SourceStatus[];
  overallStatus: OverallStatus;
  isTickerStale: (ticker: string) => boolean;
  getTickerStaleness: (ticker: string) => SourceStatus | null;
}

function computeOverallStatus(sources: SourceStatus[]): OverallStatus {
  if (sources.length === 0) return "unknown";
  const allStale = sources.every((s) => s.stale);
  const anyStale = sources.some((s) => s.stale);
  if (allStale) return "down";
  if (anyStale) return "degraded";
  return "healthy";
}

/**
 * Fetches source health from GET /api/risk/health and provides
 * per-ticker staleness lookups and overall pipeline status.
 * Refreshes every 30 seconds.
 */
export function useSourceHealth(): SourceHealthResult {
  const { data, isError } = useQuery<SourceHealthResponse>({
    queryKey: ["source-health"],
    queryFn: async () => {
      const res = await fetch("/api/risk/health");
      if (!res.ok) throw new Error("Health check failed");
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const sources = data?.sources ?? [];
  const sourceMap = new Map(sources.map((s) => [s.source, s]));

  const overallStatus: OverallStatus =
    isError || !data ? "unknown" : computeOverallStatus(sources);

  function isTickerStale(ticker: string): boolean {
    const source = getSourceForTicker(ticker);
    if (!source) return false;
    const status = sourceMap.get(source);
    return status?.stale ?? false;
  }

  function getTickerStaleness(ticker: string): SourceStatus | null {
    const source = getSourceForTicker(ticker);
    if (!source) return null;
    return sourceMap.get(source) ?? null;
  }

  return { sources, overallStatus, isTickerStale, getTickerStaleness };
}
