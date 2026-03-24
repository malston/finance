import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThreatGauge } from "@/components/risk/threat-gauge";

describe("ThreatGauge", () => {
  it("renders an SVG element", () => {
    const { container } = render(
      <ThreatGauge score={50} color="#eab308" framework="bookstaber" />,
    );
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });

  it("displays the score number", () => {
    render(<ThreatGauge score={64} color="#f97316" framework="bookstaber" />);
    expect(screen.getByTestId("gauge-score")).toHaveTextContent("64");
  });

  it("displays the threat level label", () => {
    render(<ThreatGauge score={64} color="#f97316" framework="bookstaber" />);
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("HIGH");
  });

  it("displays LOW label for score <= 25", () => {
    render(<ThreatGauge score={20} color="#22c55e" framework="bookstaber" />);
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("LOW");
  });

  it("displays ELEVATED label for score 26-50", () => {
    render(<ThreatGauge score={40} color="#eab308" framework="bookstaber" />);
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("ELEVATED");
  });

  it("displays CRITICAL label for score > 75", () => {
    render(<ThreatGauge score={85} color="#ef4444" framework="bookstaber" />);
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("CRITICAL");
  });

  it("renders an arc path element", () => {
    const { container } = render(
      <ThreatGauge score={50} color="#eab308" framework="bookstaber" />,
    );
    const paths = container.querySelectorAll("path");
    expect(paths.length).toBeGreaterThanOrEqual(1);
  });

  it("applies the color to the arc stroke", () => {
    const { container } = render(
      <ThreatGauge score={64} color="#f97316" framework="bookstaber" />,
    );
    const arc = container.querySelector("[data-testid='gauge-arc']");
    expect(arc).toBeInTheDocument();
    expect(arc!.getAttribute("stroke")).toBe("#f97316");
  });

  it("renders a background arc track", () => {
    const { container } = render(
      <ThreatGauge score={50} color="#eab308" framework="bookstaber" />,
    );
    const track = container.querySelector("[data-testid='gauge-track']");
    expect(track).toBeInTheDocument();
  });

  it("applies glow filter", () => {
    const { container } = render(
      <ThreatGauge score={64} color="#f97316" framework="bookstaber" />,
    );
    const filter = container.querySelector("filter");
    expect(filter).toBeInTheDocument();
  });

  it("accepts a size prop and sets SVG dimensions", () => {
    const { container } = render(
      <ThreatGauge
        score={50}
        color="#eab308"
        size={90}
        framework="bookstaber"
      />,
    );
    const svg = container.querySelector("svg");
    expect(svg!.getAttribute("width")).toBe("90");
    expect(svg!.getAttribute("height")).toBe("90");
  });

  it("renders score with 0 correctly", () => {
    render(<ThreatGauge score={0} color="#22c55e" framework="bookstaber" />);
    expect(screen.getByTestId("gauge-score")).toHaveTextContent("0");
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("LOW");
  });

  it("renders score with 100 correctly", () => {
    render(<ThreatGauge score={100} color="#ef4444" framework="bookstaber" />);
    expect(screen.getByTestId("gauge-score")).toHaveTextContent("100");
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("CRITICAL");
  });

  it("renders -- when score is null", () => {
    render(<ThreatGauge score={null} color="#475569" framework="bookstaber" />);
    expect(screen.getByTestId("gauge-score")).toHaveTextContent("--");
  });

  it("does not render a threat level label when score is null", () => {
    render(<ThreatGauge score={null} color="#475569" framework="bookstaber" />);
    expect(screen.getByTestId("gauge-label")).toHaveTextContent("");
  });

  it("does not render score arc when score is null", () => {
    const { container } = render(
      <ThreatGauge score={null} color="#475569" framework="bookstaber" />,
    );
    expect(
      container.querySelector("[data-testid='gauge-arc']"),
    ).not.toBeInTheDocument();
  });

  describe("framework-aware labels", () => {
    it("uses bookstaber bands when framework is bookstaber", () => {
      render(<ThreatGauge score={28} color="#eab308" framework="bookstaber" />);
      expect(screen.getByTestId("gauge-label")).toHaveTextContent("ELEVATED");
    });

    it("uses yardeni bands when framework is yardeni", () => {
      render(<ThreatGauge score={28} color="#22c55e" framework="yardeni" />);
      expect(screen.getByTestId("gauge-label")).toHaveTextContent("LOW");
    });

    it("score 76 is CRITICAL under bookstaber but HIGH under yardeni", () => {
      const { unmount } = render(
        <ThreatGauge score={76} color="#ef4444" framework="bookstaber" />,
      );
      expect(screen.getByTestId("gauge-label")).toHaveTextContent("CRITICAL");
      unmount();

      render(<ThreatGauge score={76} color="#f97316" framework="yardeni" />);
      expect(screen.getByTestId("gauge-label")).toHaveTextContent("HIGH");
    });
  });
});
