import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createWrapper } from "@/test/query-test-utils";

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
  {
    time: "2026-03-20T14:30:00Z",
    domain: "private_credit",
    headline: "CLO market sees unexpected inflows",
    sentiment: 0.42,
    source_name: "Bloomberg",
    source_url: "https://bloomberg.com/news/clo",
  },
];

const SAMPLE_NEWS_AI_TECH = [
  {
    time: "2026-03-20T14:00:00Z",
    domain: "ai_tech",
    headline: "NVIDIA beats earnings expectations",
    sentiment: 0.78,
    source_name: "CNBC",
    source_url: "https://cnbc.com/nvidia",
  },
];

const SAMPLE_SENTIMENT_TIMESERIES = [
  {
    time: "2026-03-20T15:00:00Z",
    ticker: "SENTIMENT_PRIVATE_CREDIT",
    value: -0.35,
    source: "valyu",
  },
];

const SAMPLE_SENTIMENT_AI = [
  {
    time: "2026-03-20T15:00:00Z",
    ticker: "SENTIMENT_AI_TECH",
    value: 0.55,
    source: "valyu",
  },
];

function mockFetchResponses(overrides: Record<string, unknown[]> = {}) {
  const defaults: Record<string, unknown[]> = {
    "domain=private_credit": SAMPLE_NEWS_PRIVATE_CREDIT,
    "domain=ai_tech": SAMPLE_NEWS_AI_TECH,
    "domain=energy_geo": [],
    "domain=geopolitical": [],
    "ticker=SENTIMENT_PRIVATE_CREDIT": SAMPLE_SENTIMENT_TIMESERIES,
    "ticker=SENTIMENT_AI_TECH": SAMPLE_SENTIMENT_AI,
    "ticker=SENTIMENT_ENERGY_GEO": [],
    "ticker=SENTIMENT_GEOPOLITICAL": [],
  };
  const responses = { ...defaults, ...overrides };

  mockFetch.mockImplementation((url: string) => {
    for (const [key, data] of Object.entries(responses)) {
      if (url.includes(key)) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(data),
        });
      }
    }
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve([]),
    });
  });
}

describe("NewsSentimentSidebar", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders the News Sentiment header", async () => {
    mockFetchResponses();
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });
    expect(screen.getByText("News Sentiment")).toBeInTheDocument();
  });

  it("renders four domain tabs", async () => {
    mockFetchResponses();
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });
    expect(
      screen.getByRole("tab", { name: /Private Credit/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /AI \/ Tech/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Energy \/ Geo/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: /Geopolitical/i }),
    ).toBeInTheDocument();
  });

  it("displays headlines for the active domain tab", async () => {
    mockFetchResponses();
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByText(/Blue Owl Capital reports NAV decline/),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByText(/CLO market sees unexpected inflows/),
    ).toBeInTheDocument();
  });

  it("displays sentiment pill with correct color coding for negative sentiment", async () => {
    mockFetchResponses();
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("-0.65")).toBeInTheDocument();
    });

    const pill = screen.getByText("-0.65");
    expect(pill).toHaveStyle({ backgroundColor: "#ef4444" });
    expect(pill).toHaveStyle({ color: "#fecaca" });
  });

  it("displays sentiment pill with correct color coding for positive sentiment", async () => {
    mockFetchResponses();
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("+0.42")).toBeInTheDocument();
    });

    const pill = screen.getByText("+0.42");
    expect(pill).toHaveStyle({ backgroundColor: "#22c55e" });
    expect(pill).toHaveStyle({ color: "#dcfce7" });
  });

  it("displays source name for each headline", async () => {
    mockFetchResponses();
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Reuters")).toBeInTheDocument();
    });
    expect(screen.getByText("Bloomberg")).toBeInTheDocument();
  });

  it("displays domain sentiment aggregate badge", async () => {
    mockFetchResponses();
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("domain-sentiment-badge")).toBeInTheDocument();
    });

    const badge = screen.getByTestId("domain-sentiment-badge");
    expect(badge).toHaveTextContent("-0.35");
  });

  it("switches domain tabs and shows different headlines", async () => {
    mockFetchResponses();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText(/Blue Owl Capital/)).toBeInTheDocument();
    });

    const aiTab = screen.getByRole("tab", { name: /AI \/ Tech/i });
    await user.click(aiTab);

    await waitFor(() => {
      expect(
        screen.getByText(/NVIDIA beats earnings expectations/),
      ).toBeInTheDocument();
    });
  });

  it("shows placeholder when no headlines exist for a domain", async () => {
    mockFetchResponses();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });

    const geoTab = screen.getByRole("tab", { name: /Energy \/ Geo/i });
    await user.click(geoTab);

    await waitFor(() => {
      expect(screen.getByText("No recent headlines")).toBeInTheDocument();
    });
  });

  it("auto-refreshes every 60 seconds", async () => {
    mockFetchResponses();
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
    });

    const initialCallCount = mockFetch.mock.calls.length;

    vi.advanceTimersByTime(60_000);

    await waitFor(() => {
      expect(mockFetch.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

  it("shows error indicator when fetch fails", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("news-error-indicator")).toBeInTheDocument();
    });
    expect(screen.getByText("Unable to load headlines")).toBeInTheDocument();
  });

  it("shows error indicator when API returns non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });
    render(<NewsSentimentSidebar />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("news-error-indicator")).toBeInTheDocument();
    });
  });
});
