import { useQuery } from "@tanstack/react-query";

interface TickerFreshness {
  last_updated: string | null;
  source: string;
  status: string;
}

interface FreshnessResponse {
  tickers: Record<string, TickerFreshness>;
}

interface FreshnessResult {
  getTickerFreshness: (ticker: string) => TickerFreshness | null;
  isError: boolean;
  error: Error | null;
}

/**
 * Fetches per-ticker freshness data from GET /api/risk/freshness.
 * Auto-refreshes every 30 seconds.
 */
export function useFreshness(): FreshnessResult {
  const { data, isError, error } = useQuery<FreshnessResponse>({
    queryKey: ["ticker-freshness"],
    queryFn: async () => {
      const res = await fetch("/api/risk/freshness");
      if (!res.ok) throw new Error("Freshness fetch failed");
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  function getTickerFreshness(ticker: string): TickerFreshness | null {
    if (isError) {
      return { last_updated: null, source: "", status: "unknown" };
    }
    return data?.tickers[ticker] ?? null;
  }

  return { getTickerFreshness, isError, error: error ?? null };
}
