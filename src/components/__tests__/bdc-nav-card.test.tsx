import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { BDCNavCard } from "@/components/bdc-nav-card";

const SAMPLE_DISCOUNT_DATA = [
  {
    time: "2026-03-20T15:00:00Z",
    ticker: "BDC_AVG_NAV_DISCOUNT",
    value: -0.083,
    source: "computed",
  },
];

const SAMPLE_NAV_DATA = [
  {
    time: "2026-03-20T15:00:00Z",
    ticker: "NAV_OWL",
    value: 20.0,
    source: "valyu",
  },
  {
    time: "2026-03-20T15:00:00Z",
    ticker: "NAV_ARCC",
    value: 22.0,
    source: "valyu",
  },
  {
    time: "2026-03-20T15:00:00Z",
    ticker: "NAV_BXSL",
    value: 28.0,
    source: "valyu",
  },
  {
    time: "2026-03-20T15:00:00Z",
    ticker: "NAV_OBDC",
    value: 15.0,
    source: "valyu",
  },
];

const SAMPLE_PRICE_DATA = [
  {
    time: "2026-03-20T15:00:00Z",
    ticker: "OWL",
    value: 18.0,
    source: "finnhub",
  },
  {
    time: "2026-03-20T15:00:00Z",
    ticker: "ARCC",
    value: 20.0,
    source: "finnhub",
  },
  {
    time: "2026-03-20T15:00:00Z",
    ticker: "BXSL",
    value: 26.0,
    source: "finnhub",
  },
  {
    time: "2026-03-20T15:00:00Z",
    ticker: "OBDC",
    value: 13.0,
    source: "finnhub",
  },
];

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
});

describe("BDCNavCard", () => {
  function setupMockFetch() {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("ticker=BDC_AVG_NAV_DISCOUNT")) {
        return Promise.resolve({
          ok: true,
          json: async () => SAMPLE_DISCOUNT_DATA,
        });
      }
      if (url.includes("/api/risk/latest-prices")) {
        return Promise.resolve({
          ok: true,
          json: async () => [...SAMPLE_NAV_DATA, ...SAMPLE_PRICE_DATA],
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });
  }

  it("renders the card title", async () => {
    setupMockFetch();
    render(<BDCNavCard />);
    expect(screen.getByText("BDC NAV Discount")).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));
    render(<BDCNavCard />);
    expect(screen.getByTestId("bdc-nav-loading")).toBeInTheDocument();
  });

  it("displays the average discount percentage", async () => {
    setupMockFetch();
    render(<BDCNavCard />);
    await waitFor(() => {
      expect(screen.getByTestId("bdc-nav-value")).toBeInTheDocument();
    });
    expect(screen.getByTestId("bdc-nav-value").textContent).toBe("-8.3%");
  });

  it("displays BDC ticker rows in the detail table", async () => {
    setupMockFetch();
    render(<BDCNavCard />);
    await waitFor(() => {
      expect(screen.getByTestId("bdc-nav-table")).toBeInTheDocument();
    });
    expect(screen.getByText("OWL")).toBeInTheDocument();
    expect(screen.getByText("ARCC")).toBeInTheDocument();
    expect(screen.getByText("BXSL")).toBeInTheDocument();
    expect(screen.getByText("OBDC")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<BDCNavCard />);
    await waitFor(() => {
      expect(screen.getByTestId("bdc-nav-error")).toBeInTheDocument();
    });
  });

  it("fetches discount data from timeseries endpoint", async () => {
    setupMockFetch();
    render(<BDCNavCard />);
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });
    const calls = mockFetch.mock.calls.map((c: string[]) => c[0]);
    const hasDiscountCall = calls.some(
      (url: string) =>
        url.includes("/api/risk/timeseries") &&
        url.includes("BDC_AVG_NAV_DISCOUNT"),
    );
    expect(hasDiscountCall).toBe(true);
  });
});
