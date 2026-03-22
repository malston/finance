import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { createWrapper } from "@/test/query-test-utils";
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

const LOW_SCORES_RESPONSE = {
  composite: { score: 15, level: "LOW", color: "#22c55e" },
  domains: {
    private_credit: {
      score: 12,
      level: "LOW",
      weight: 0.3,
      color: "#22c55e",
    },
    ai_concentration: {
      score: 18,
      level: "LOW",
      weight: 0.2,
      color: "#22c55e",
    },
    energy_geo: {
      score: 20,
      level: "LOW",
      weight: 0.25,
      color: "#22c55e",
    },
    contagion: {
      score: 10,
      level: "LOW",
      weight: 0.25,
      color: "#22c55e",
    },
  },
  updated_at: "2026-03-20T15:00:00Z",
};

const CRITICAL_SCORES_RESPONSE = {
  composite: { score: 88, level: "CRITICAL", color: "#ef4444" },
  domains: {
    private_credit: {
      score: 90,
      level: "CRITICAL",
      weight: 0.3,
      color: "#ef4444",
    },
    ai_concentration: {
      score: 82,
      level: "CRITICAL",
      weight: 0.2,
      color: "#ef4444",
    },
    energy_geo: {
      score: 85,
      level: "CRITICAL",
      weight: 0.25,
      color: "#ef4444",
    },
    contagion: {
      score: 92,
      level: "CRITICAL",
      weight: 0.25,
      color: "#ef4444",
    },
  },
  updated_at: "2026-03-20T15:00:00Z",
};

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
});

describe("CompositeScore", () => {
  it("fetches from /api/risk/scores", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith("/api/risk/scores");
    });
  });

  it("displays the composite score as a number", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("composite-score-value")).toHaveTextContent(
        "62",
      );
    });
  });

  it("displays the threat level label", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("composite-threat-level")).toHaveTextContent(
        "HIGH",
      );
    });
  });

  it("displays the section title", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    expect(screen.getByText("Composite Systemic Risk")).toBeInTheDocument();
  });

  it("renders four domain badges", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByTestId("domain-badge-private_credit"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("domain-badge-ai_concentration"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("domain-badge-energy_geo")).toBeInTheDocument();
      expect(screen.getByTestId("domain-badge-contagion")).toBeInTheDocument();
    });
  });

  it("displays domain scores in badges", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(
        screen.getByTestId("domain-badge-private_credit"),
      ).toHaveTextContent("68");
      expect(
        screen.getByTestId("domain-badge-ai_concentration"),
      ).toHaveTextContent("45");
      expect(screen.getByTestId("domain-badge-energy_geo")).toHaveTextContent(
        "72",
      );
      expect(screen.getByTestId("domain-badge-contagion")).toHaveTextContent(
        "58",
      );
    });
  });

  it("displays domain names as labels", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByText("Credit")).toBeInTheDocument();
      expect(screen.getByText("AI Conc.")).toBeInTheDocument();
      expect(screen.getByText("Energy/Geo")).toBeInTheDocument();
      expect(screen.getByText("Contagion")).toBeInTheDocument();
    });
  });

  it("applies threat-level color to composite score", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      const scoreEl = screen.getByTestId("composite-score-value");
      expect(scoreEl.style.color).toBe("rgb(249, 115, 22)");
    });
  });

  it("applies threat-level color to the level label", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      const levelEl = screen.getByTestId("composite-threat-level");
      expect(levelEl.style.color).toBe("rgb(249, 115, 22)");
    });
  });

  it("shows loading state before data arrives", () => {
    mockFetch.mockReturnValue(new Promise(() => {}));

    render(<CompositeScore />, { wrapper: createWrapper() });

    expect(screen.getByTestId("composite-score-loading")).toBeInTheDocument();
  });

  it("shows error state when fetch fails", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("composite-score-error")).toBeInTheDocument();
    });
  });

  it("shows error state for non-ok API response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("composite-score-error")).toBeInTheDocument();
    });
  });

  it("displays LOW level with green color", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => LOW_SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      const scoreEl = screen.getByTestId("composite-score-value");
      expect(scoreEl).toHaveTextContent("15");
      expect(scoreEl.style.color).toBe("rgb(34, 197, 94)");
    });

    expect(screen.getByTestId("composite-threat-level")).toHaveTextContent(
      "LOW",
    );
  });

  it("displays CRITICAL level with red color", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => CRITICAL_SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      const scoreEl = screen.getByTestId("composite-score-value");
      expect(scoreEl).toHaveTextContent("88");
      expect(scoreEl.style.color).toBe("rgb(239, 68, 68)");
    });

    expect(screen.getByTestId("composite-threat-level")).toHaveTextContent(
      "CRITICAL",
    );
  });

  it("handles stale response where composite score is null", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        composite: { score: null, level: null, color: null },
        domains: {
          private_credit: {
            score: null,
            level: null,
            weight: 0.3,
            color: null,
          },
          ai_concentration: {
            score: null,
            level: null,
            weight: 0.2,
            color: null,
          },
          energy_geo: { score: null, level: null, weight: 0.25, color: null },
          contagion: { score: null, level: null, weight: 0.25, color: null },
        },
        updated_at: null,
        stale: true,
        message: "Scoring pipeline has not produced results yet",
      }),
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      expect(screen.getByTestId("composite-score-value")).toHaveTextContent(
        "--",
      );
    });
  });

  it("renders score: 0 as '0', not '--'", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        composite: { score: 0, level: "LOW", color: "#22c55e" },
        domains: {
          private_credit: {
            score: 0,
            level: "LOW",
            weight: 0.3,
            color: "#22c55e",
          },
          ai_concentration: {
            score: 0,
            level: "LOW",
            weight: 0.2,
            color: "#22c55e",
          },
          energy_geo: {
            score: 0,
            level: "LOW",
            weight: 0.25,
            color: "#22c55e",
          },
          contagion: {
            score: 0,
            level: "LOW",
            weight: 0.25,
            color: "#22c55e",
          },
        },
        updated_at: "2026-03-20T15:00:00Z",
      }),
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      const scoreEl = screen.getByTestId("composite-score-value");
      expect(scoreEl).toHaveTextContent("0");
      expect(scoreEl).not.toHaveTextContent("--");
    });

    expect(screen.getByTestId("domain-badge-private_credit")).toHaveTextContent(
      "0",
    );
  });

  it("applies domain-specific colors to badges", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => SCORES_RESPONSE,
    });

    render(<CompositeScore />, { wrapper: createWrapper() });

    await waitFor(() => {
      const creditBadge = screen.getByTestId("domain-badge-ai_concentration");
      // ai_concentration has ELEVATED level with yellow color
      expect(creditBadge.style.color).toBe("rgb(234, 179, 8)");
    });
  });
});
