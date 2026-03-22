import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWrapper } from "@/test/query-test-utils";
import { HealthIndicator } from "@/components/risk/health-indicator";
import type { SourceHealthResponse } from "@/lib/source-health";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const HEALTHY_RESPONSE: SourceHealthResponse = {
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

const PARTIAL_STALE_RESPONSE: SourceHealthResponse = {
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

const ALL_STALE_RESPONSE: SourceHealthResponse = {
  sources: [
    {
      source: "finnhub",
      last_success: null,
      stale: true,
      staleness_threshold: "15m",
      consecutive_failures: 5,
    },
    {
      source: "fred",
      last_success: null,
      stale: true,
      staleness_threshold: "24h",
      consecutive_failures: 3,
    },
  ],
};

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
});

describe("HealthIndicator", () => {
  it("renders the health dot", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => HEALTHY_RESPONSE,
    });

    render(<HealthIndicator />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("health-dot")).toBeInTheDocument();
    });
  });

  it("shows green dot when all sources are healthy", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => HEALTHY_RESPONSE,
    });

    render(<HealthIndicator />, { wrapper: createWrapper() });

    await waitFor(() => {
      const dot = screen.getByTestId("health-dot");
      expect(dot.style.backgroundColor).toBe("rgb(34, 197, 94)");
    });
  });

  it("shows orange dot when some sources are stale", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => PARTIAL_STALE_RESPONSE,
    });

    render(<HealthIndicator />, { wrapper: createWrapper() });

    await waitFor(() => {
      const dot = screen.getByTestId("health-dot");
      expect(dot.style.backgroundColor).toBe("rgb(249, 115, 22)");
    });
  });

  it("shows red dot when all sources are stale", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ALL_STALE_RESPONSE,
    });

    render(<HealthIndicator />, { wrapper: createWrapper() });

    await waitFor(() => {
      const dot = screen.getByTestId("health-dot");
      expect(dot.style.backgroundColor).toBe("rgb(239, 68, 68)");
    });
  });

  it("shows gray dot when API fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    render(<HealthIndicator />, { wrapper: createWrapper() });

    await waitFor(() => {
      const dot = screen.getByTestId("health-dot");
      expect(dot.style.backgroundColor).toBe("rgb(100, 116, 139)");
    });
  });

  it("shows tooltip with per-source status on hover", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => PARTIAL_STALE_RESPONSE,
    });

    const user = userEvent.setup();
    render(<HealthIndicator />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("health-dot")).toBeInTheDocument();
    });

    const trigger = screen.getByTestId("health-indicator");
    await user.hover(trigger);

    await waitFor(() => {
      const tooltip = screen.getByTestId("health-tooltip");
      expect(tooltip).toBeInTheDocument();
      expect(tooltip.textContent).toContain("finnhub");
      expect(tooltip.textContent).toContain("fred");
    });
  });

  it("shows 'Health check unavailable' tooltip when API fails", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500 });

    const user = userEvent.setup();
    render(<HealthIndicator />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("health-dot")).toBeInTheDocument();
    });

    const trigger = screen.getByTestId("health-indicator");
    await user.hover(trigger);

    await waitFor(() => {
      const tooltip = screen.getByTestId("health-tooltip");
      expect(tooltip.textContent).toContain("Health check unavailable");
    });
  });

  it("shows last_success time for each source in tooltip", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => HEALTHY_RESPONSE,
    });

    const user = userEvent.setup();
    render(<HealthIndicator />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("health-dot")).toBeInTheDocument();
    });

    const trigger = screen.getByTestId("health-indicator");
    await user.hover(trigger);

    await waitFor(() => {
      const tooltip = screen.getByTestId("health-tooltip");
      expect(tooltip.textContent).toContain("finnhub");
      expect(tooltip.textContent).toContain("fred");
    });
  });
});
