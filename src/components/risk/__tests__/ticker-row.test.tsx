import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TickerRow } from "@/components/risk/ticker-row";

const SAMPLE_TIMESERIES = [100, 102, 105, 103, 108, 110, 107, 112, 115, 113];

describe("TickerRow", () => {
  it("renders the ticker symbol", () => {
    render(
      <TickerRow
        symbol="NVDA"
        label="NVDA"
        price={875.5}
        change={2.3}
        timeseries={SAMPLE_TIMESERIES}
        color="#a855f7"
      />,
    );
    expect(screen.getByTestId("ticker-symbol")).toHaveTextContent("NVDA");
  });

  it("renders the ticker label when different from symbol", () => {
    render(
      <TickerRow
        symbol="BAMLH0A0HYM2"
        label="HY Credit Spread"
        price={3.45}
        change={0.12}
        timeseries={SAMPLE_TIMESERIES}
        color="#f97316"
      />,
    );
    expect(screen.getByTestId("ticker-label")).toHaveTextContent(
      "HY Credit Spread",
    );
  });

  it("renders the current price", () => {
    render(
      <TickerRow
        symbol="NVDA"
        label="NVDA"
        price={875.5}
        change={2.3}
        timeseries={SAMPLE_TIMESERIES}
        color="#a855f7"
      />,
    );
    expect(screen.getByTestId("ticker-price")).toHaveTextContent("875.50");
  });

  it("renders the daily change percentage", () => {
    render(
      <TickerRow
        symbol="NVDA"
        label="NVDA"
        price={875.5}
        change={2.3}
        timeseries={SAMPLE_TIMESERIES}
        color="#a855f7"
      />,
    );
    expect(screen.getByTestId("ticker-change")).toHaveTextContent("+2.30%");
  });

  it("renders negative change with minus sign", () => {
    render(
      <TickerRow
        symbol="META"
        label="META"
        price={500.0}
        change={-1.5}
        timeseries={SAMPLE_TIMESERIES}
        color="#a855f7"
      />,
    );
    expect(screen.getByTestId("ticker-change")).toHaveTextContent("-1.50%");
  });

  it("applies green color for positive change on normal ticker", () => {
    render(
      <TickerRow
        symbol="NVDA"
        label="NVDA"
        price={875.5}
        change={2.3}
        timeseries={SAMPLE_TIMESERIES}
        color="#a855f7"
      />,
    );
    const changeEl = screen.getByTestId("ticker-change");
    expect(changeEl.style.color).toBe("rgb(34, 197, 94)"); // #22c55e
  });

  it("applies red color for negative change on normal ticker", () => {
    render(
      <TickerRow
        symbol="META"
        label="META"
        price={500.0}
        change={-1.5}
        timeseries={SAMPLE_TIMESERIES}
        color="#a855f7"
      />,
    );
    const changeEl = screen.getByTestId("ticker-change");
    expect(changeEl.style.color).toBe("rgb(239, 68, 68)"); // #ef4444
  });

  it("inverts colors when inverted prop is true (red for positive)", () => {
    render(
      <TickerRow
        symbol="BAMLH0A0HYM2"
        label="HY Credit Spread"
        price={3.45}
        change={0.12}
        timeseries={SAMPLE_TIMESERIES}
        color="#f97316"
        inverted
      />,
    );
    const changeEl = screen.getByTestId("ticker-change");
    expect(changeEl.style.color).toBe("rgb(239, 68, 68)"); // #ef4444 (red for positive = bad)
  });

  it("inverts colors when inverted prop is true (green for negative)", () => {
    render(
      <TickerRow
        symbol="BAMLH0A0HYM2"
        label="HY Credit Spread"
        price={3.45}
        change={-0.05}
        timeseries={SAMPLE_TIMESERIES}
        color="#f97316"
        inverted
      />,
    );
    const changeEl = screen.getByTestId("ticker-change");
    expect(changeEl.style.color).toBe("rgb(34, 197, 94)"); // #22c55e (green for negative = good)
  });

  it("renders a sparkline SVG", () => {
    const { container } = render(
      <TickerRow
        symbol="NVDA"
        label="NVDA"
        price={875.5}
        change={2.3}
        timeseries={SAMPLE_TIMESERIES}
        color="#a855f7"
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders alert badge when alertMessage is provided", () => {
    render(
      <TickerRow
        symbol="VIX"
        label="VIX"
        price={25.3}
        change={5.2}
        timeseries={SAMPLE_TIMESERIES}
        color="#ef4444"
        alertMessage="Above 20 threshold"
      />,
    );
    expect(screen.getByTestId("ticker-alert")).toHaveTextContent(
      "Above 20 threshold",
    );
  });

  it("does not render alert badge when no alertMessage", () => {
    render(
      <TickerRow
        symbol="VIX"
        label="VIX"
        price={15.0}
        change={-1.0}
        timeseries={SAMPLE_TIMESERIES}
        color="#ef4444"
      />,
    );
    expect(screen.queryByTestId("ticker-alert")).toBeNull();
  });
});
