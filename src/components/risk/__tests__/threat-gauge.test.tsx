import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThreatGauge } from "@/components/risk/threat-gauge";

describe("ThreatGauge", () => {
  it("renders an SVG element", () => {
    const { container } = render(<ThreatGauge score={50} color="#eab308" />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("displays the score number", () => {
    render(<ThreatGauge score={64} color="#f97316" />);
    expect(screen.getByTestId("gauge-score")).toHaveTextContent("64");
  });

  it("displays the threat level label", () => {
    render(<ThreatGauge score={64} color="#f97316" />);
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("HIGH");
  });

  it("displays LOW label for score <= 25", () => {
    render(<ThreatGauge score={20} color="#22c55e" />);
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("LOW");
  });

  it("displays ELEVATED label for score 26-50", () => {
    render(<ThreatGauge score={40} color="#eab308" />);
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("ELEVATED");
  });

  it("displays CRITICAL label for score > 75", () => {
    render(<ThreatGauge score={85} color="#ef4444" />);
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("CRITICAL");
  });

  it("renders an arc path element", () => {
    const { container } = render(<ThreatGauge score={50} color="#eab308" />);
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it("applies the color to the arc stroke", () => {
    const { container } = render(<ThreatGauge score={64} color="#f97316" />);
    const arc = container.querySelector("[data-testid='gauge-arc']");
    expect(arc).toBeInTheDocument();
    expect(arc!.getAttribute("stroke")).toBe("#f97316");
  });

  it("renders a background arc track", () => {
    const { container } = render(<ThreatGauge score={50} color="#eab308" />);
    const track = container.querySelector("[data-testid='gauge-track']");
    expect(track).toBeInTheDocument();
  });

  it("applies glow filter", () => {
    const { container } = render(<ThreatGauge score={64} color="#f97316" />);
    const filter = container.querySelector("filter");
    expect(filter).toBeInTheDocument();
  });

  it("accepts a size prop and sets SVG dimensions", () => {
    const { container } = render(
      <ThreatGauge score={50} color="#eab308" size={90} />,
    );
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("width")).toBe("90");
    expect(svg!.getAttribute("height")).toBe("90");
  });

  it("renders score with 0 correctly", () => {
    render(<ThreatGauge score={0} color="#22c55e" />);
    expect(screen.getByTestId("gauge-score")).toHaveTextContent("0");
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("LOW");
  });

  it("renders score with 100 correctly", () => {
    render(<ThreatGauge score={100} color="#ef4444" />);
    expect(screen.getByTestId("gauge-score")).toHaveTextContent("100");
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("CRITICAL");
  });
});
