import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { createWrapper } from "@/test/query-test-utils";
import { SectorPanel } from "@/components/risk/sector-panel";
import type { DomainConfig } from "@/lib/domain-config";
import type { SourceHealthResponse } from "@/lib/source-health";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const CREDIT_DOMAIN: DomainConfig = {
  name: "Private Credit Stress",
  description: "BDC discounts, HY spreads, redemption pressure",
  icon: "building2",
  color: "#f97316",
  scoreKey: "private_credit",
  tickers: [
    { symbol: "OWL", label: "OWL" },
    { symbol: "ARCC", label: "ARCC" },
    { symbol: "BAMLH0A0HYM2", label: "HY Credit Spread", inverted: true },
  ],
};

const MOCK_SCORES = {
  composite: { score: 64, level: "HIGH", color: "#f97316" },
  domains: {
    private_credit: {
      score: 68,
      level: "HIGH",
      weight: 0.3,
      color: "#f97316",
    },
  },
  updated_at: "2026-03-20T15:00:00Z",
};

function makeTimeseries(ticker: string, count = 10) {
  return Array.from({ length: count }, (_, i) => ({
    time: `2026-03-${String(i + 1).padStart(2, "0")}T15:00:00Z`,
    ticker,
    value: 100 + i * 2 + Math.random() * 5,
    source: "finnhub",
  }));
}

const PARTIAL_STALE_HEALTH: SourceHealthResponse = {
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
  ],
};

const ALL_HEALTHY: SourceHealthResponse = {
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
  ],
};

function mockFetches(health: SourceHealthResponse) {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/api/risk/scores")) {
      return Promise.resolve({
        ok: true,
        json: async () => MOCK_SCORES,
      });
    }
    if (url.includes("/api/risk/health")) {
      return Promise.resolve({
        ok: true,
        json: async () => health,
      });
    }
    if (url.includes("/api/risk/timeseries")) {
      const params = new URL(url, "http://localhost").searchParams;
      const ticker = params.get("ticker") || "UNKNOWN";
      return Promise.resolve({
        ok: true,
        json: async () => makeTimeseries(ticker),
      });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
  });
}

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
});

describe("SectorPanel with health data", () => {
  it("shows stale badge on BAMLH0A0HYM2 when fred is stale", async () => {
    mockFetches(PARTIAL_STALE_HEALTH);
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const badgeRow = screen.getByTestId("ticker-row-BAMLH0A0HYM2");
      const staleBadge = badgeRow.querySelector('[data-testid="stale-badge"]');
      expect(staleBadge).toBeInTheDocument();
      expect(staleBadge!.textContent).toContain("Data stale");
    });
  });

  it("does not show stale badge on OWL when finnhub is healthy", async () => {
    mockFetches(PARTIAL_STALE_HEALTH);
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("ticker-row-OWL")).toBeInTheDocument();
    });

    const owlRow = screen.getByTestId("ticker-row-OWL");
    const staleBadge = owlRow.querySelector('[data-testid="stale-badge"]');
    expect(staleBadge).toBeNull();
  });

  it("shows no stale badges when all sources are healthy", async () => {
    mockFetches(ALL_HEALTHY);
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("ticker-row-OWL")).toBeInTheDocument();
    });

    expect(screen.queryAllByTestId("stale-badge")).toHaveLength(0);
  });

  it("shows stale warning icon next to domain name when any ticker is stale", async () => {
    mockFetches(PARTIAL_STALE_HEALTH);
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("domain-stale-warning")).toBeInTheDocument();
    });
  });

  it("does not show stale warning icon when all sources healthy", async () => {
    mockFetches(ALL_HEALTHY);
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("ticker-row-OWL")).toBeInTheDocument();
    });

    expect(screen.queryByTestId("domain-stale-warning")).toBeNull();
  });
});
