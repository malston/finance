import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWrapper } from "@/test/query-test-utils";
import { SectorPanel } from "@/components/risk/sector-panel";
import type { DomainConfig } from "@/lib/domain-config";

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

const CONTAGION_DOMAIN: DomainConfig = {
  name: "Cross-Domain Contagion",
  description: "Rolling correlations across sectors, VIX, MOVE",
  icon: "link",
  color: "#ef4444",
  scoreKey: "contagion",
  tickers: [
    { symbol: "CORR", label: "Max Pairwise Correlation" },
    { symbol: "VIX", label: "VIX" },
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
    contagion: {
      score: 61,
      level: "HIGH",
      weight: 0.25,
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

function mockAllFetches() {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/api/risk/scores")) {
      return Promise.resolve({
        ok: true,
        json: async () => MOCK_SCORES,
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

describe("SectorPanel", () => {
  it("renders the domain name", async () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText("Private Credit Stress")).toBeInTheDocument();
  });

  it("renders the domain description", async () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByText((content, element) => {
        return (
          element?.textContent ===
          "BDC discounts, HY spreads, redemption pressure"
        );
      }),
    ).toBeInTheDocument();
  });

  it("renders a ThreatGauge in the header", async () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("threat-gauge")).toBeInTheDocument();
    });
  });

  it("displays the domain score in the threat gauge", async () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("gauge-score")).toHaveTextContent("68");
    });
  });

  it("is collapsed by default when defaultExpanded is false", () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByTestId("sector-ticker-table")).toBeNull();
  });

  it("is expanded by default when defaultExpanded is true", async () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("sector-ticker-table")).toBeInTheDocument();
    });
  });

  it("toggles expanded state on header click", async () => {
    mockAllFetches();
    const user = userEvent.setup();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    expect(screen.queryByTestId("sector-ticker-table")).toBeNull();

    const header = screen.getByTestId("sector-panel-header");
    await user.click(header);

    await waitFor(() => {
      expect(screen.getByTestId("sector-ticker-table")).toBeInTheDocument();
    });
  });

  it("collapses on second header click", async () => {
    mockAllFetches();
    const user = userEvent.setup();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("sector-ticker-table")).toBeInTheDocument();
    });

    const header = screen.getByTestId("sector-panel-header");
    await user.click(header);

    expect(screen.queryByTestId("sector-ticker-table")).toBeNull();
  });

  it("renders ticker rows when expanded", async () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("ticker-row-OWL")).toBeInTheDocument();
      expect(screen.getByTestId("ticker-row-ARCC")).toBeInTheDocument();
      expect(screen.getByTestId("ticker-row-BAMLH0A0HYM2")).toBeInTheDocument();
    });
  });

  it("renders column headers in expanded state", async () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("sector-ticker-table")).toBeInTheDocument();
    });

    expect(screen.getByText("TICKER")).toBeInTheDocument();
    expect(screen.getByText("79-DAY TREND")).toBeInTheDocument();
    expect(screen.getByText("LAST")).toBeInTheDocument();
    expect(screen.getByText("CHG")).toBeInTheDocument();
  });

  it("applies domain color to active border", async () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const panel = screen.getByTestId("sector-panel-private_credit");
      expect(panel.style.borderColor).toContain("249, 115, 22");
    });
  });

  it("fetches scores with framework parameter", async () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const scoreCalls = mockFetch.mock.calls.filter((c: string[]) =>
        c[0].includes("/api/risk/scores"),
      );
      expect(scoreCalls.length).toBeGreaterThanOrEqual(1);
      expect(scoreCalls[0][0]).toContain("?framework=bookstaber");
    });
  });

  it("shows 'as of' timestamp when score data is aged", async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/risk/scores")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...MOCK_SCORES, updated_at: twoHoursAgo }),
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

    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const ageEl = screen.getByTestId("sector-panel-score-age");
      expect(ageEl).toBeInTheDocument();
      expect(ageEl.textContent).toContain("as of");
      expect(ageEl.textContent).toContain("ET");
    });
  });

  it("hides 'as of' timestamp when score data is fresh", async () => {
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/risk/scores")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ ...MOCK_SCORES, updated_at: oneMinAgo }),
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

    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(screen.getByTestId("threat-gauge")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("sector-panel-score-age")).toBeNull();
  });

  it("fetches domain score from /api/risk/scores", async () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const scoreCalls = mockFetch.mock.calls.filter((c: string[]) =>
        c[0].includes("/api/risk/scores"),
      );
      expect(scoreCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  it("fetches timeseries for each ticker when expanded", async () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded />, {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      const tsCalls = mockFetch.mock.calls.filter((c: string[]) =>
        c[0].includes("/api/risk/timeseries"),
      );
      expect(tsCalls.length).toBeGreaterThanOrEqual(
        CREDIT_DOMAIN.tickers.length,
      );
    });
  });

  it("renders expand/collapse arrow indicator", () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    expect(
      screen.getByTestId("sector-panel-collapse-arrow"),
    ).toBeInTheDocument();
  });

  it("renders domain icon", () => {
    mockAllFetches();
    render(<SectorPanel domain={CREDIT_DOMAIN} defaultExpanded={false} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId("sector-panel-icon")).toBeInTheDocument();
  });
});
