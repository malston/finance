import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { EquityEtfCard } from "@/components/equity-etf-card";

const SAMPLE_DATA = [
  {
    ticker: "OWL",
    value: 19.85,
    time: "2026-03-20T15:00:00Z",
    source: "finnhub",
  },
  {
    ticker: "ARCC",
    value: 21.5,
    time: "2026-03-20T15:00:00Z",
    source: "finnhub",
  },
  {
    ticker: "NVDA",
    value: 875.5,
    time: "2026-03-20T15:00:00Z",
    source: "finnhub",
  },
  {
    ticker: "MSFT",
    value: 425.0,
    time: "2026-03-20T15:00:00Z",
    source: "finnhub",
  },
  {
    ticker: "GOOGL",
    value: 178.25,
    time: "2026-03-20T15:00:00Z",
    source: "finnhub",
  },
  {
    ticker: "BXSL",
    value: 28.9,
    time: "2026-03-20T15:00:00Z",
    source: "finnhub",
  },
  {
    ticker: "OBDC",
    value: 14.55,
    time: "2026-03-20T15:00:00Z",
    source: "finnhub",
  },
];

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
});

describe("EquityEtfCard", () => {
  it("renders the card title", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_DATA,
    });

    render(<EquityEtfCard />);

    expect(screen.getByText("Equity & ETF Prices")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<EquityEtfCard />);

    expect(screen.getByTestId("equity-etf-loading")).toBeInTheDocument();
  });

  it("displays ticker symbols in a table", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_DATA,
    });

    render(<EquityEtfCard />);

    await waitFor(() => {
      expect(screen.getByTestId("equity-etf-table")).toBeInTheDocument();
    });

    expect(screen.getByText("OWL")).toBeInTheDocument();
    expect(screen.getByText("NVDA")).toBeInTheDocument();
    expect(screen.getByText("MSFT")).toBeInTheDocument();
    expect(screen.getByText("GOOGL")).toBeInTheDocument();
  });

  it("displays prices for each ticker", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_DATA,
    });

    render(<EquityEtfCard />);

    await waitFor(() => {
      expect(screen.getByTestId("equity-etf-table")).toBeInTheDocument();
    });

    expect(screen.getByText("19.85")).toBeInTheDocument();
    expect(screen.getByText("875.50")).toBeInTheDocument();
  });

  it("displays source column", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_DATA,
    });

    render(<EquityEtfCard />);

    await waitFor(() => {
      expect(screen.getByTestId("equity-etf-table")).toBeInTheDocument();
    });

    // All rows should show "finnhub" source
    const sources = screen.getAllByText("finnhub");
    expect(sources.length).toBeGreaterThanOrEqual(1);
  });

  it("shows stale data badge when fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(<EquityEtfCard />);

    await waitFor(() => {
      expect(screen.getByTestId("equity-etf-error")).toBeInTheDocument();
    });
  });

  it("fetches data from the latest-prices endpoint", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_DATA,
    });

    render(<EquityEtfCard />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain("/api/risk/latest-prices");
  });

  it("table has column headers for Symbol, Price, Source, Last Updated", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_DATA,
    });

    render(<EquityEtfCard />);

    await waitFor(() => {
      expect(screen.getByTestId("equity-etf-table")).toBeInTheDocument();
    });

    expect(screen.getByText("Symbol")).toBeInTheDocument();
    expect(screen.getByText("Price")).toBeInTheDocument();
    expect(screen.getByText("Source")).toBeInTheDocument();
    expect(screen.getByText("Last Updated")).toBeInTheDocument();
  });
});
