import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FrameworkProvider } from "@/lib/framework-context";

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

function createFrameworkWrapper(framework: "bookstaber" | "yardeni") {
  window.localStorage.setItem("risk-framework", framework);
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FrameworkProvider>{children}</FrameworkProvider>
      </QueryClientProvider>
    );
  };
}

describe("CorrelationChart with framework context", () => {
  beforeEach(() => {
    window.localStorage.removeItem("risk-framework");
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
    mockFetch.mockReset();
    vi.restoreAllMocks();
    window.localStorage.removeItem("risk-framework");
  });

  it("fetches with framework=bookstaber param when bookstaber is active", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_CORRELATION_DATA,
    });

    render(<CorrelationChart />, {
      wrapper: createFrameworkWrapper("bookstaber"),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/risk/correlations?days=79&framework=bookstaber",
      );
    });
  });

  it("fetches with framework=yardeni param when yardeni is active", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SAMPLE_CORRELATION_DATA,
    });

    render(<CorrelationChart />, {
      wrapper: createFrameworkWrapper("yardeni"),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/risk/correlations?days=79&framework=yardeni",
      );
    });
  });
});
