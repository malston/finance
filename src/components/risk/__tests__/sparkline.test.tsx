import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Sparkline } from "@/components/risk/sparkline";

const SAMPLE_DATA = [10, 12, 15, 13, 18, 20, 17, 22, 25, 23];

describe("Sparkline", () => {
  it("renders an SVG element", () => {
    const { container } = render(
      <Sparkline data={SAMPLE_DATA} color="#f97316" />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("renders a polyline for the data", () => {
    const { container } = render(
      <Sparkline data={SAMPLE_DATA} color="#f97316" />,
    );
    const polyline = container.querySelector("polyline");
    expect(polyline).toBeInTheDocument();
  });

  it("applies the color to the polyline stroke", () => {
    const { container } = render(
      <Sparkline data={SAMPLE_DATA} color="#a855f7" />,
    );
    const polyline = container.querySelector("polyline");
    expect(polyline!.getAttribute("stroke")).toBe("#a855f7");
  });

  it("renders a filled area polygon below the line", () => {
    const { container } = render(
      <Sparkline data={SAMPLE_DATA} color="#f97316" />,
    );
    const polygon = container.querySelector("polygon");
    expect(polygon).toBeInTheDocument();
  });

  it("defaults to 160px width and 40px height", () => {
    const { container } = render(
      <Sparkline data={SAMPLE_DATA} color="#f97316" />,
    );
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("width")).toBe("160");
    expect(svg!.getAttribute("height")).toBe("40");
  });

  it("accepts width and height props", () => {
    const { container } = render(
      <Sparkline data={SAMPLE_DATA} color="#f97316" width={200} height={50} />,
    );
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("width")).toBe("200");
    expect(svg!.getAttribute("height")).toBe("50");
  });

  it("renders nothing for empty data", () => {
    const { container } = render(<Sparkline data={[]} color="#f97316" />);
    const polyline = container.querySelector("polyline");
    expect(polyline).toBeNull();
  });

  it("polyline points contain correct number of coordinates", () => {
    const { container } = render(
      <Sparkline data={SAMPLE_DATA} color="#f97316" />,
    );
    const polyline = container.querySelector("polyline");
    const points = polyline!.getAttribute("points")!;
    const pairs = points.trim().split(/\s+/);
    expect(pairs).toHaveLength(SAMPLE_DATA.length);
  });

  it("renders end dot when alert is true", () => {
    const { container } = render(
      <Sparkline data={SAMPLE_DATA} color="#f97316" alert />,
    );
    const dot = container.querySelector("[data-testid='sparkline-dot']");
    expect(dot).toBeInTheDocument();
  });

  it("does not render end dot when alert is false", () => {
    const { container } = render(
      <Sparkline data={SAMPLE_DATA} color="#f97316" />,
    );
    const dot = container.querySelector("[data-testid='sparkline-dot']");
    expect(dot).toBeNull();
  });

  it("renders a gradient fill using the domain color", () => {
    const { container } = render(
      <Sparkline data={SAMPLE_DATA} color="#06b6d4" />,
    );
    const stops = container.querySelectorAll("stop");
    expect(stops.length).toBeGreaterThanOrEqual(2);
    const firstStop = stops[0];
    expect(firstStop.getAttribute("stop-color")).toBe("#06b6d4");
  });
});
