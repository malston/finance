import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { SectorPanels } from "@/components/risk/sector-panels";

const MOCK_SCORES = {
  composite: { score: 64, level: "HIGH", color: "#f97316" },
  domains: {
    private_credit: { score: 68, level: "HIGH", weight: 0.3, color: "#f97316" },
    ai_concentration: {
      score: 52,
      level: "HIGH",
      weight: 0.2,
      color: "#f97316",
    },
    energy_geo: { score: 74, level: "HIGH", weight: 0.25, color: "#f97316" },
    contagion: { score: 61, level: "HIGH", weight: 0.25, color: "#f97316" },
  },
  updated_at: "2026-03-20T15:00:00Z",
};

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  };
}

function mockAllFetches() {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("/api/risk/scores")) {
      return Promise.resolve({ ok: true, json: async () => MOCK_SCORES });
    }
    if (url.includes("/api/risk/timeseries")) {
      const params = new URL(url, "http://localhost").searchParams;
      const ticker = params.get("ticker") || "UNKNOWN";
      const data = Array.from({ length: 10 }, (_, i) => ({
        time: `2026-03-${String(i + 1).padStart(2, "0")}T15:00:00Z`,
        ticker,
        value: 100 + i * 2,
        source: "finnhub",
      }));
      return Promise.resolve({ ok: true, json: async () => data });
    }
    return Promise.resolve({ ok: false, json: async () => ({}) });
  });
}

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
});

describe("SectorPanels", () => {
  it("renders all four domain panels", async () => {
    mockAllFetches();
    render(<SectorPanels />, { wrapper: createWrapper() });

    expect(screen.getByText("Private Credit Stress")).toBeInTheDocument();
    expect(screen.getByText("AI / Tech Concentration")).toBeInTheDocument();
    expect(screen.getByText("Energy & Geopolitical")).toBeInTheDocument();
    expect(screen.getByText("Cross-Domain Contagion")).toBeInTheDocument();
  });

  it("renders four sector panels", async () => {
    mockAllFetches();
    render(<SectorPanels />, { wrapper: createWrapper() });

    const panels = screen.getAllByTestId("sector-panel");
    expect(panels).toHaveLength(4);
  });

  it("first panel (Private Credit) is expanded by default", async () => {
    mockAllFetches();
    render(<SectorPanels />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("sector-ticker-table")).toBeInTheDocument();
    });
  });

  it("displays non-zero scores for all domains", async () => {
    mockAllFetches();
    render(<SectorPanels />, { wrapper: createWrapper() });

    await waitFor(() => {
      const gaugeScores = screen.getAllByTestId("gauge-score");
      expect(gaugeScores).toHaveLength(4);

      const scoreValues = gaugeScores.map((el) => el.textContent);
      expect(scoreValues).toContain("68");
      expect(scoreValues).toContain("52");
      expect(scoreValues).toContain("74");
      expect(scoreValues).toContain("61");
    });
  });
});
