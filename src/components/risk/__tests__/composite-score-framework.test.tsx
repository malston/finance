import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FrameworkProvider } from "@/lib/framework-context";
import { CompositeScore } from "@/components/risk/composite-score";

const mockFetch = vi.fn();
global.fetch = mockFetch;

const SCORES_RESPONSE = {
  composite: { score: 62, level: "HIGH", color: "#f97316" },
  domains: {
    private_credit: {
      score: 68,
      level: "HIGH",
      weight: 0.3,
      color: "#f97316",
    },
    ai_concentration: {
      score: 45,
      level: "ELEVATED",
      weight: 0.2,
      color: "#eab308",
    },
    energy_geo: {
      score: 72,
      level: "HIGH",
      weight: 0.25,
      color: "#f97316",
    },
    contagion: {
      score: 58,
      level: "HIGH",
      weight: 0.25,
      color: "#f97316",
    },
  },
  updated_at: "2026-03-20T15:00:00Z",
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

describe("CompositeScore with framework context", () => {
  beforeEach(() => {
    window.localStorage.removeItem("risk-framework");
  });

  afterEach(() => {
    cleanup();
    mockFetch.mockReset();
    window.localStorage.removeItem("risk-framework");
  });

  it("fetches /api/risk/scores?framework=bookstaber when bookstaber is active", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, {
      wrapper: createFrameworkWrapper("bookstaber"),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/risk/scores?framework=bookstaber",
      );
    });
  });

  it("fetches /api/risk/scores?framework=yardeni when yardeni is active", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, {
      wrapper: createFrameworkWrapper("yardeni"),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/risk/scores?framework=yardeni",
      );
    });
  });
});
