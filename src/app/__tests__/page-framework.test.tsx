import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWrapper } from "@/test/query-test-utils";
import DashboardPage from "@/app/page";

const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockAllFetches() {
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("/api/risk/scores")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          composite: { score: 50, level: "ELEVATED", color: "#eab308" },
          domains: {
            private_credit: {
              score: 50,
              level: "ELEVATED",
              weight: 0.3,
              color: "#eab308",
            },
            ai_concentration: {
              score: 50,
              level: "ELEVATED",
              weight: 0.2,
              color: "#eab308",
            },
            energy_geo: {
              score: 50,
              level: "ELEVATED",
              weight: 0.25,
              color: "#eab308",
            },
            contagion: {
              score: 50,
              level: "ELEVATED",
              weight: 0.25,
              color: "#eab308",
            },
          },
          updated_at: "2026-03-20T15:00:00Z",
        }),
      });
    }
    if (typeof url === "string" && url.includes("/api/risk/timeseries")) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (typeof url === "string" && url.includes("/api/risk/latest-prices")) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (typeof url === "string" && url.includes("/api/risk/correlations")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({
          credit_tech: [],
          credit_energy: [],
          tech_energy: [],
          max_current: {
            pair: "credit_tech",
            value: 0,
            above_threshold: false,
          },
        }),
      });
    }
    if (typeof url === "string" && url.includes("/api/risk/news")) {
      return Promise.resolve({ ok: true, json: async () => [] });
    }
    if (typeof url === "string" && url.includes("/api/risk/freshness")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ tickers: {} }),
      });
    }
    if (typeof url === "string" && url.includes("/api/risk/health")) {
      return Promise.resolve({
        ok: true,
        json: async () => ({ sources: [] }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

describe("Dashboard page with framework switching", () => {
  beforeEach(() => {
    window.localStorage.removeItem("risk-framework");
  });

  afterEach(() => {
    cleanup();
    mockFetch.mockReset();
    window.localStorage.removeItem("risk-framework");
  });

  it("renders the framework toggle in the header", () => {
    mockAllFetches();
    render(<DashboardPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId("framework-toggle")).toBeInTheDocument();
  });

  it("shows Yardeni title when Yardeni toggle is clicked", async () => {
    mockAllFetches();
    const user = userEvent.setup();
    render(<DashboardPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /Yardeni/i }));

    expect(screen.getByText("YARDENI RESILIENCE MONITOR")).toBeInTheDocument();
  });

  it("shows Yardeni subtitle when Yardeni toggle is clicked", async () => {
    mockAllFetches();
    const user = userEvent.setup();
    render(<DashboardPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /Yardeni/i }));

    expect(
      screen.getByText(
        /Resilience monitor.*tracking self-correction across risk domains/,
      ),
    ).toBeInTheDocument();
  });

  it("reverts to Bookstaber title when switching back", async () => {
    mockAllFetches();
    const user = userEvent.setup();
    render(<DashboardPage />, { wrapper: createWrapper() });

    await user.click(screen.getByRole("button", { name: /Yardeni/i }));
    await user.click(screen.getByRole("button", { name: /Bookstaber/i }));

    expect(screen.getByText("BOOKSTABER RISK MONITOR")).toBeInTheDocument();
  });
});
