import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { FreshnessDot } from "@/components/risk/freshness-dot";

describe("FreshnessDot", () => {
  let now: Date;

  beforeEach(() => {
    now = new Date("2026-03-20T15:00:00Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders a green dot for live finnhub data (< 15 min)", () => {
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    render(<FreshnessDot lastUpdated={fiveMinAgo} source="finnhub" />);
    const dot = screen.getByTestId("freshness-dot");
    expect(dot.style.backgroundColor).toBe("rgb(34, 197, 94)"); // #22c55e
  });

  it("renders a yellow dot for stale finnhub data (15min - 1h)", () => {
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    render(<FreshnessDot lastUpdated={thirtyMinAgo} source="finnhub" />);
    const dot = screen.getByTestId("freshness-dot");
    expect(dot.style.backgroundColor).toBe("rgb(234, 179, 8)"); // #eab308
  });

  it("renders a red dot for offline finnhub data (> 1h)", () => {
    const twoHoursAgo = new Date(
      now.getTime() - 2 * 60 * 60 * 1000,
    ).toISOString();
    render(<FreshnessDot lastUpdated={twoHoursAgo} source="finnhub" />);
    const dot = screen.getByTestId("freshness-dot");
    expect(dot.style.backgroundColor).toBe("rgb(239, 68, 68)"); // #ef4444
  });

  it("renders a gray dot when no data is available", () => {
    render(<FreshnessDot lastUpdated={null} source="finnhub" />);
    const dot = screen.getByTestId("freshness-dot");
    expect(dot.style.backgroundColor).toBe("rgb(100, 116, 139)"); // #64748b
  });

  it("renders a green dot for fresh FRED data (< 24h)", () => {
    const twelveHoursAgo = new Date(
      now.getTime() - 12 * 60 * 60 * 1000,
    ).toISOString();
    render(<FreshnessDot lastUpdated={twelveHoursAgo} source="fred" />);
    const dot = screen.getByTestId("freshness-dot");
    expect(dot.style.backgroundColor).toBe("rgb(34, 197, 94)"); // #22c55e
  });

  it("renders a yellow dot for stale FRED data (24h - 48h)", () => {
    const thirtyHoursAgo = new Date(
      now.getTime() - 30 * 60 * 60 * 1000,
    ).toISOString();
    render(<FreshnessDot lastUpdated={thirtyHoursAgo} source="fred" />);
    const dot = screen.getByTestId("freshness-dot");
    expect(dot.style.backgroundColor).toBe("rgb(234, 179, 8)"); // #eab308
  });

  it("is 6px wide and 6px tall", () => {
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    render(<FreshnessDot lastUpdated={fiveMinAgo} source="finnhub" />);
    const dot = screen.getByTestId("freshness-dot");
    expect(dot.style.width).toBe("6px");
    expect(dot.style.height).toBe("6px");
    expect(dot.style.borderRadius).toBe("50%");
  });

  it("has pulse animation class on green dots only", () => {
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { rerender } = render(
      <FreshnessDot lastUpdated={fiveMinAgo} source="finnhub" />,
    );
    const greenDot = screen.getByTestId("freshness-dot");
    expect(greenDot.style.animationName).toBe("freshness-pulse");

    const twoHoursAgo = new Date(
      now.getTime() - 2 * 60 * 60 * 1000,
    ).toISOString();
    rerender(<FreshnessDot lastUpdated={twoHoursAgo} source="finnhub" />);
    const redDot = screen.getByTestId("freshness-dot");
    expect(redDot.style.animationName).toBe("");
  });

  it("renders tooltip text with relative time", () => {
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    render(<FreshnessDot lastUpdated={fiveMinAgo} source="finnhub" />);
    const dot = screen.getByTestId("freshness-dot");
    expect(dot.getAttribute("title")).toBe("Last updated: 5m ago");
  });

  it("renders 'No data' tooltip when lastUpdated is null", () => {
    render(<FreshnessDot lastUpdated={null} source="finnhub" />);
    const dot = screen.getByTestId("freshness-dot");
    expect(dot.getAttribute("title")).toBe("No data");
  });

  it("renders tooltip with 'Stale:' prefix for stale data", () => {
    const twoHoursAgo = new Date(
      now.getTime() - 2 * 60 * 60 * 1000,
    ).toISOString();
    render(<FreshnessDot lastUpdated={twoHoursAgo} source="finnhub" />);
    const dot = screen.getByTestId("freshness-dot");
    expect(dot.getAttribute("title")).toBe("Stale: last update 2h ago");
  });
});
