import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock recharts to avoid rendering SVG in jsdom
vi.mock("recharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="responsive-container">{children}</div>
  ),
  AreaChart: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => <div data-testid="area" />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
}));

import { TreasuryCreditCard } from "@/components/treasury-credit-card";

const DGS10_DATA = [
  {
    time: "2026-03-15T00:00:00Z",
    ticker: "DGS10",
    value: 4.25,
    source: "fred",
  },
  { time: "2026-03-16T00:00:00Z", ticker: "DGS10", value: 4.3, source: "fred" },
];

const DGS2_DATA = [
  { time: "2026-03-15T00:00:00Z", ticker: "DGS2", value: 3.8, source: "fred" },
  { time: "2026-03-16T00:00:00Z", ticker: "DGS2", value: 3.85, source: "fred" },
];

const T10Y2Y_DATA = [
  {
    time: "2026-03-15T00:00:00Z",
    ticker: "T10Y2Y",
    value: 0.45,
    source: "fred",
  },
  {
    time: "2026-03-16T00:00:00Z",
    ticker: "T10Y2Y",
    value: 0.45,
    source: "fred",
  },
];

function mockAllFetches() {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("ticker=DGS10")) {
      return Promise.resolve({ ok: true, json: async () => DGS10_DATA });
    }
    if (url.includes("ticker=DGS2")) {
      return Promise.resolve({ ok: true, json: async () => DGS2_DATA });
    }
    if (url.includes("ticker=T10Y2Y")) {
      return Promise.resolve({ ok: true, json: async () => T10Y2Y_DATA });
    }
    return Promise.resolve({ ok: false, status: 404 });
  });
}

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
});

describe("TreasuryCreditCard", () => {
  it("renders the card title", async () => {
    mockAllFetches();
    render(<TreasuryCreditCard />);
    expect(screen.getByText("Treasury & Credit Spreads")).toBeInTheDocument();
  });

  it("displays latest DGS10 value with label", async () => {
    mockAllFetches();
    render(<TreasuryCreditCard />);

    await waitFor(() => {
      expect(screen.getByTestId("dgs10-value")).toBeInTheDocument();
    });

    expect(screen.getByTestId("dgs10-value").textContent).toContain("4.30");
    expect(screen.getByText("10Y")).toBeInTheDocument();
  });

  it("displays latest DGS2 value with label", async () => {
    mockAllFetches();
    render(<TreasuryCreditCard />);

    await waitFor(() => {
      expect(screen.getByTestId("dgs2-value")).toBeInTheDocument();
    });

    expect(screen.getByTestId("dgs2-value").textContent).toContain("3.85");
    expect(screen.getByText("2Y")).toBeInTheDocument();
  });

  it("displays latest T10Y2Y value with label", async () => {
    mockAllFetches();
    render(<TreasuryCreditCard />);

    await waitFor(() => {
      expect(screen.getByTestId("t10y2y-value")).toBeInTheDocument();
    });

    expect(screen.getByTestId("t10y2y-value").textContent).toContain("0.45");
    expect(screen.getByText("Curve")).toBeInTheDocument();
  });

  it("renders a sparkline for T10Y2Y", async () => {
    mockAllFetches();
    render(<TreasuryCreditCard />);

    await waitFor(() => {
      expect(screen.getByTestId("area-chart")).toBeInTheDocument();
    });
  });

  it("fetches data from correct API endpoints with 79 days", async () => {
    mockAllFetches();
    render(<TreasuryCreditCard />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    const urls = mockFetch.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(
      urls.some(
        (u: string) => u.includes("ticker=DGS10") && u.includes("days=79"),
      ),
    ).toBe(true);
    expect(
      urls.some(
        (u: string) => u.includes("ticker=DGS2") && u.includes("days=79"),
      ),
    ).toBe(true);
    expect(
      urls.some(
        (u: string) => u.includes("ticker=T10Y2Y") && u.includes("days=79"),
      ),
    ).toBe(true);
  });

  it("shows stale badge when any fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<TreasuryCreditCard />);

    await waitFor(() => {
      expect(screen.getByTestId("treasury-stale-badge")).toBeInTheDocument();
    });
  });

  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // Never resolves
    render(<TreasuryCreditCard />);
    expect(screen.getByTestId("treasury-loading")).toBeInTheDocument();
  });

  it("displays values with percent sign", async () => {
    mockAllFetches();
    render(<TreasuryCreditCard />);

    await waitFor(() => {
      expect(screen.getByTestId("dgs10-value")).toBeInTheDocument();
    });

    // Values should have % suffix
    expect(screen.getByTestId("dgs10-value").textContent).toMatch(/%/);
    expect(screen.getByTestId("dgs2-value").textContent).toMatch(/%/);
    expect(screen.getByTestId("t10y2y-value").textContent).toMatch(/%/);
  });
});
