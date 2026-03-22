import React from "react";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FrameworkProvider } from "@/lib/framework-context";

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { NewsSentimentSidebar } from "@/components/news-sentiment-sidebar";

const SAMPLE_NEWS_PRIVATE_CREDIT = [
  {
    time: "2026-03-20T15:00:00Z",
    domain: "private_credit",
    headline: "Blue Owl Capital reports NAV decline in Q1 filing",
    sentiment: -0.65,
    source_name: "Reuters",
    source_url: "https://reuters.com/article/blue-owl",
  },
];

function mockFetchResponses() {
  mockFetch.mockImplementation((url: string) => {
    if (url.includes("domain=private_credit")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(SAMPLE_NEWS_PRIVATE_CREDIT),
      });
    }
    if (url.includes("/api/risk/timeseries")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      });
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });
}

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

describe("NewsSentimentSidebar with framework context", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    window.localStorage.removeItem("risk-framework");
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.removeItem("risk-framework");
  });

  it("includes framework=yardeni in news fetch URLs when yardeni is active", async () => {
    mockFetchResponses();
    render(<NewsSentimentSidebar />, {
      wrapper: createFrameworkWrapper("yardeni"),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const newsUrls = mockFetch.mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((url: string) => url.includes("/api/risk/news"));

    expect(newsUrls.length).toBeGreaterThan(0);
    for (const url of newsUrls) {
      expect(url).toContain("framework=yardeni");
    }
  });

  it("includes framework=bookstaber in news fetch URLs when bookstaber is active", async () => {
    mockFetchResponses();
    render(<NewsSentimentSidebar />, {
      wrapper: createFrameworkWrapper("bookstaber"),
    });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const newsUrls = mockFetch.mock.calls
      .map((c: unknown[]) => c[0] as string)
      .filter((url: string) => url.includes("/api/risk/news"));

    expect(newsUrls.length).toBeGreaterThan(0);
    for (const url of newsUrls) {
      expect(url).toContain("framework=bookstaber");
    }
  });
});
