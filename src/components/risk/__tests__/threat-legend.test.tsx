import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ThreatLegend } from "@/components/risk/threat-legend";

describe("ThreatLegend", () => {
  it("renders the threat-legend container", () => {
    render(<ThreatLegend />);
    expect(screen.getByTestId("threat-legend")).toBeInTheDocument();
  });

  it("renders all four threat level labels", () => {
    render(<ThreatLegend />);
    expect(screen.getByText("LOW (0-25)")).toBeInTheDocument();
    expect(screen.getByText("ELEVATED (26-50)")).toBeInTheDocument();
    expect(screen.getByText("HIGH (51-75)")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL (76-100)")).toBeInTheDocument();
  });

  it("renders four colored dots", () => {
    render(<ThreatLegend />);
    const dots = screen.getAllByTestId("legend-dot");
    expect(dots).toHaveLength(4);
  });

  it("applies correct colors to dots", () => {
    render(<ThreatLegend />);
    const dots = screen.getAllByTestId("legend-dot");
    // jsdom converts hex to rgb in computed style
    expect(dots[0].style.background).toBe("rgb(34, 197, 94)");
    expect(dots[1].style.background).toBe("rgb(234, 179, 8)");
    expect(dots[2].style.background).toBe("rgb(249, 115, 22)");
    expect(dots[3].style.background).toBe("rgb(239, 68, 68)");
  });

  it("applies box-shadow glow to dots", () => {
    render(<ThreatLegend />);
    const dots = screen.getAllByTestId("legend-dot");
    for (const dot of dots) {
      expect(dot.style.boxShadow).toContain("0 0 4px");
    }
  });

  it("uses 8px circle dots", () => {
    render(<ThreatLegend />);
    const dots = screen.getAllByTestId("legend-dot");
    for (const dot of dots) {
      expect(dot.style.width).toBe("8px");
      expect(dot.style.height).toBe("8px");
      expect(dot.style.borderRadius).toBe("50%");
    }
  });

  it("uses monospace font for labels", () => {
    render(<ThreatLegend />);
    const legend = screen.getByTestId("threat-legend");
    const items = legend.querySelectorAll("[data-testid='legend-item']");
    for (const item of items) {
      const el = item as HTMLElement;
      expect(el.style.fontFamily).toContain("JetBrains Mono");
    }
  });

  it("uses #475569 text color for labels", () => {
    render(<ThreatLegend />);
    const items = screen.getAllByTestId("legend-item");
    for (const item of items) {
      // jsdom converts hex #475569 to rgb(71, 85, 105)
      expect(item.style.color).toBe("rgb(71, 85, 105)");
    }
  });
});
