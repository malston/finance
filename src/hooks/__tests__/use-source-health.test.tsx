import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, waitFor, cleanup } from "@testing-library/react";
import { createWrapper } from "@/test/query-test-utils";
import { useSourceHealth } from "@/hooks/use-source-health";
import type { SourceHealthResponse } from "@/lib/source-health";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const HEALTHY_RESPONSE: SourceHealthResponse = {
  sources: [
    {
      source: "finnhub",
      last_success: "2026-03-20T15:00:00Z",
      stale: false,
      staleness_threshold: "15m",
      consecutive_failures: 0,
    },
    {
      source: "fred",
      last_success: "2026-03-20T14:00:00Z",
      stale: false,
      staleness_threshold: "24h",
      consecutive_failures: 0,
    },
    {
      source: "valyu",
      last_success: "2026-03-20T13:00:00Z",
      stale: false,
      staleness_threshold: "2h",
      consecutive_failures: 0,
    },
  ],
};

const PARTIAL_STALE_RESPONSE: SourceHealthResponse = {
  sources: [
    {
      source: "finnhub",
      last_success: "2026-03-20T15:00:00Z",
      stale: false,
      staleness_threshold: "15m",
      consecutive_failures: 0,
    },
    {
      source: "fred",
      last_success: "2026-03-19T10:00:00Z",
      stale: true,
      staleness_threshold: "24h",
      consecutive_failures: 2,
    },
    {
      source: "valyu",
      last_success: "2026-03-20T13:00:00Z",
      stale: false,
      staleness_threshold: "2h",
      consecutive_failures: 0,
    },
  ],
};

const ALL_STALE_RESPONSE: SourceHealthResponse = {
  sources: [
    {
      source: "finnhub",
      last_success: null,
      stale: true,
      staleness_threshold: "15m",
      consecutive_failures: 5,
    },
    {
      source: "fred",
      last_success: null,
      stale: true,
      staleness_threshold: "24h",
      consecutive_failures: 3,
    },
    {
      source: "valyu",
      last_success: null,
      stale: true,
      staleness_threshold: "2h",
      consecutive_failures: 4,
    },
  ],
};

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
});

describe("useSourceHealth", () => {
  it("fetches from /api/risk/health", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => HEALTHY_RESPONSE,
    });

    renderHook(() => useSourceHealth(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/risk/health");
    });
  });

  it("returns sources array when API is healthy", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => HEALTHY_RESPONSE,
    });

    const { result } = renderHook(() => useSourceHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.sources).toHaveLength(3);
    });
  });

  it("returns overallStatus green when all sources healthy", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => HEALTHY_RESPONSE,
    });

    const { result } = renderHook(() => useSourceHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.overallStatus).toBe("healthy");
    });
  });

  it("returns overallStatus degraded when some sources are stale", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => PARTIAL_STALE_RESPONSE,
    });

    const { result } = renderHook(() => useSourceHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.overallStatus).toBe("degraded");
    });
  });

  it("returns overallStatus down when all sources are stale", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ALL_STALE_RESPONSE,
    });

    const { result } = renderHook(() => useSourceHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.overallStatus).toBe("down");
    });
  });

  it("returns overallStatus unknown when API fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const { result } = renderHook(() => useSourceHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.overallStatus).toBe("unknown");
    });
  });

  it("isTickerStale returns true for tickers from a stale source", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => PARTIAL_STALE_RESPONSE,
    });

    const { result } = renderHook(() => useSourceHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isTickerStale("BAMLH0A0HYM2")).toBe(true);
      expect(result.current.isTickerStale("DGS10")).toBe(true);
    });
  });

  it("isTickerStale returns false for tickers from a healthy source", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => PARTIAL_STALE_RESPONSE,
    });

    const { result } = renderHook(() => useSourceHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isTickerStale("NVDA")).toBe(false);
      expect(result.current.isTickerStale("SPY")).toBe(false);
    });
  });

  it("isTickerStale returns false for unknown tickers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => PARTIAL_STALE_RESPONSE,
    });

    const { result } = renderHook(() => useSourceHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isTickerStale("CORR")).toBe(false);
      expect(result.current.isTickerStale("SPY_RSP_RATIO")).toBe(false);
    });
  });

  it("getTickerStaleness returns source status for a ticker", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => PARTIAL_STALE_RESPONSE,
    });

    const { result } = renderHook(() => useSourceHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const status = result.current.getTickerStaleness("DGS10");
      expect(status).not.toBeNull();
      expect(status!.source).toBe("fred");
      expect(status!.stale).toBe(true);
      expect(status!.last_success).toBe("2026-03-19T10:00:00Z");
    });
  });

  it("getTickerStaleness returns null for unknown tickers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => HEALTHY_RESPONSE,
    });

    const { result } = renderHook(() => useSourceHealth(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.getTickerStaleness("CORR")).toBeNull();
    });
  });
});
