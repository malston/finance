import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { createWrapper } from "@/test/query-test-utils";

// Recharts ResponsiveContainer requires ResizeObserver, which jsdom lacks
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver;

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { CorrelationChart } from "@/components/risk/correlation-chart";

const SAMPLE_CORRELATION_DATA = {
  credit_tech: Array.from({ length: 79 }, (_, i) => ({
    time: `2026-01-${String(i + 1).padStart(2, "0")}`,
    value: 0.3 + Math.sin(i / 10) * 0.2,
  })),
  credit_energy: Array.from({ length: 79 }, (_, i) => ({
    time: `2026-01-${String(i + 1).padStart(2, "0")}`,
    value: 0.1 + Math.cos(i / 10) * 0.15,
  })),
  tech_energy: Array.from({ length: 79 }, (_, i) => ({
    time: `2026-01-${String(i + 1).padStart(2, "0")}`,
    value: 0.2 + Math.sin(i / 8) * 0.1,
  })),
  max_current: {
    pair: "credit_tech",
    value: 0.623,
    above_threshold: true,
  },
};

const SAMPLE_BELOW_THRESHOLD = {
  ...SAMPLE_CORRELATION_DATA,
  max_current: {
    pair: "credit_tech",
    value: 0.382,
    above_threshold: false,
  },
};

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  mockFetch.mockReset();
  vi.restoreAllMocks();
});

describe("CorrelationChart", () => {
  it("renders the chart title", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_CORRELATION_DATA,
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    expect(
      screen.getByText("Cross-Domain Correlation Monitor"),
    ).toBeInTheDocument();
  });

  it("renders the subtitle description", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_CORRELATION_DATA,
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    expect(
      screen.getByText(/BDC.*Big Tech 30-day rolling correlation/),
    ).toBeInTheDocument();
  });

  it("shows loading state initially", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<CorrelationChart />, { wrapper: createWrapper() });

    expect(screen.getByTestId("correlation-chart-loading")).toBeInTheDocument();
  });

  it("displays current rho value after data loads", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_CORRELATION_DATA,
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("correlation-rho-value")).toHaveTextContent(
        "0.623",
      );
    });
  });

  it("displays rho value in red when above threshold (> 0.5)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_CORRELATION_DATA,
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    await waitFor(() => {
      const rhoElement = screen.getByTestId("correlation-rho-value");
      expect(rhoElement).toHaveTextContent("0.623");
    });

    const rhoElement = screen.getByTestId("correlation-rho-value");
    expect(rhoElement.style.color).toBe("rgb(239, 68, 68)");
  });

  it("displays rho value in yellow when below threshold (<= 0.5)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_BELOW_THRESHOLD,
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    await waitFor(() => {
      const rhoElement = screen.getByTestId("correlation-rho-value");
      expect(rhoElement).toHaveTextContent("0.382");
    });

    const rhoElement = screen.getByTestId("correlation-rho-value");
    expect(rhoElement.style.color).toBe("rgb(234, 179, 8)");
  });

  it("renders the Recharts area chart container after data loads", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_CORRELATION_DATA,
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByTestId("correlation-chart-container"),
      ).toBeInTheDocument();
    });
  });

  it("shows empty data message when API returns empty series", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        credit_tech: [],
        credit_energy: [],
        tech_energy: [],
        max_current: { pair: "credit_tech", value: 0, above_threshold: false },
      }),
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("No correlation data")).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(<CorrelationChart />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("correlation-chart-error")).toBeInTheDocument();
    });
  });

  it("fetches data from /api/risk/correlations with framework param", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_CORRELATION_DATA,
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    const calledUrl = mockFetch.mock.calls[0][0];
    expect(calledUrl).toBe(
      "/api/risk/correlations?days=79&framework=bookstaber",
    );
  });

  it("auto-refreshes data every 60 seconds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_CORRELATION_DATA,
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    // Wait for initial fetch
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Advance 60 seconds for first poll
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockFetch).toHaveBeenCalledTimes(2);

    // Advance another 60 seconds for second poll
    await vi.advanceTimersByTimeAsync(60_000);

    expect(mockFetch).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it("displays rho label prefix", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_CORRELATION_DATA,
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("correlation-rho-value")).toHaveTextContent(
        "0.623",
      );
    });

    // The display should show "ρ =" prefix
    expect(screen.getByText(/ρ\s*=/)).toBeInTheDocument();
  });

  it("handles non-ok API response as error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("correlation-chart-error")).toBeInTheDocument();
    });
  });

  it("uses dark theme panel colors", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_CORRELATION_DATA,
    });

    render(<CorrelationChart />, { wrapper: createWrapper() });

    const panel = screen.getByTestId("correlation-chart-panel");
    expect(panel.style.background).toBe("rgb(17, 24, 39)");
  });
});
