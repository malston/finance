import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

// Mock fetch for the API call
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

import { HYCreditSpreadCard } from "@/components/hy-credit-card";

const SAMPLE_DATA = [
  {
    time: "2026-01-15T00:00:00Z",
    ticker: "BAMLH0A0HYM2",
    value: 380.5,
    source: "fred",
  },
  {
    time: "2026-01-16T00:00:00Z",
    ticker: "BAMLH0A0HYM2",
    value: 385.0,
    source: "fred",
  },
  {
    time: "2026-01-17T00:00:00Z",
    ticker: "BAMLH0A0HYM2",
    value: 382.2,
    source: "fred",
  },
];

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
});

describe("HYCreditSpreadCard", () => {
  it("renders the card title", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_DATA,
    });

    render(<HYCreditSpreadCard />);

    expect(
      screen.getByText("HY Credit Spread (BAMLH0A0HYM2)"),
    ).toBeInTheDocument();
  });

  it("displays the latest value in bps", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_DATA,
    });

    render(<HYCreditSpreadCard />);

    await waitFor(() => {
      expect(screen.getByTestId("hy-spread-value")).toBeInTheDocument();
    });

    // The latest value is 382.2 (last item in array)
    expect(screen.getByTestId("hy-spread-value").textContent).toContain(
      "382.2",
    );
  });

  it("displays bps unit label", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_DATA,
    });

    render(<HYCreditSpreadCard />);

    await waitFor(() => {
      expect(screen.getByText("bps")).toBeInTheDocument();
    });
  });

  it("renders a Recharts AreaChart", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_DATA,
    });

    render(<HYCreditSpreadCard />);

    await waitFor(() => {
      expect(screen.getByTestId("area-chart")).toBeInTheDocument();
    });
  });

  it("shows stale data badge when fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(<HYCreditSpreadCard />);

    await waitFor(() => {
      expect(screen.getByTestId("stale-data-badge")).toBeInTheDocument();
    });
  });

  it("shows stale data badge when API returns error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "db down" }),
    });

    render(<HYCreditSpreadCard />);

    await waitFor(() => {
      expect(screen.getByTestId("stale-data-badge")).toBeInTheDocument();
    });
  });

  it("fetches data from the correct API endpoint", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => SAMPLE_DATA,
    });

    render(<HYCreditSpreadCard />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/api/risk/timeseries");
    expect(calledUrl).toContain("ticker=BAMLH0A0HYM2");
    expect(calledUrl).toContain("days=79");
  });

  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // Never resolves

    render(<HYCreditSpreadCard />);

    expect(screen.getByTestId("hy-spread-loading")).toBeInTheDocument();
  });
});
