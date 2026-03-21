import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import DashboardPage from "@/app/page";

const mockFetch = vi.fn();
global.fetch = mockFetch;

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
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });
}

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
});

describe("Dashboard page", () => {
  it("renders the header with app title", () => {
    mockAllFetches();
    render(<DashboardPage />, { wrapper: createWrapper() });
    expect(screen.getByText("BOOKSTABER RISK MONITOR")).toBeInTheDocument();
  });

  it("renders the header subtitle", () => {
    mockAllFetches();
    render(<DashboardPage />, { wrapper: createWrapper() });
    expect(screen.getByText(/Systemic contagion tracker/)).toBeInTheDocument();
  });

  it("renders the diamond icon in the header", () => {
    mockAllFetches();
    render(<DashboardPage />, { wrapper: createWrapper() });
    expect(screen.getByText(/◈/)).toBeInTheDocument();
  });

  it("renders a live clock display", () => {
    mockAllFetches();
    render(<DashboardPage />, { wrapper: createWrapper() });
    const dateElement = screen.getByTestId("header-date");
    expect(dateElement).toBeInTheDocument();
    expect(dateElement.textContent).toBeTruthy();

    const timeElement = screen.getByTestId("header-time");
    expect(timeElement).toBeInTheDocument();
    expect(timeElement.textContent).toBeTruthy();
  });

  it("renders placeholder sections for composite threat, correlation chart, and sector panels", () => {
    mockAllFetches();
    render(<DashboardPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId("section-composite-threat")).toBeInTheDocument();
    expect(screen.getByTestId("section-correlation-chart")).toBeInTheDocument();
    expect(screen.getByTestId("section-sector-panels")).toBeInTheDocument();
  });

  it("applies the dark background color", () => {
    mockAllFetches();
    render(<DashboardPage />, { wrapper: createWrapper() });
    const root = screen.getByTestId("dashboard-root");
    expect(root).toBeInTheDocument();
    const style = root.style;
    expect(style.backgroundColor).toBe("rgb(10, 14, 23)");
  });

  it("renders with max-width 960px centered container", () => {
    mockAllFetches();
    render(<DashboardPage />, { wrapper: createWrapper() });
    const container = screen.getByTestId("dashboard-content");
    expect(container.style.maxWidth).toBe("960px");
  });

  it("renders the prototype data notice", () => {
    mockAllFetches();
    render(<DashboardPage />, { wrapper: createWrapper() });
    expect(screen.getByText(/SIMULATED DATA/)).toBeInTheDocument();
  });

  it("renders the Treasury & Credit Spreads card", () => {
    mockAllFetches();
    render(<DashboardPage />, { wrapper: createWrapper() });
    expect(screen.getByTestId("treasury-credit-card")).toBeInTheDocument();
  });
});
