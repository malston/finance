import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ThreatLegend } from "@/components/risk/threat-legend";
import { FrameworkProvider } from "@/lib/framework-context";

describe("ThreatLegend with framework context", () => {
  beforeEach(() => {
    window.localStorage.removeItem("risk-framework");
  });

  afterEach(() => {
    cleanup();
    window.localStorage.removeItem("risk-framework");
  });

  it("renders Bookstaber threat bands by default", () => {
    render(
      <FrameworkProvider>
        <ThreatLegend />
      </FrameworkProvider>,
    );

    expect(screen.getByText("LOW (0-25)")).toBeInTheDocument();
    expect(screen.getByText("ELEVATED (26-50)")).toBeInTheDocument();
    expect(screen.getByText("HIGH (51-75)")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL (76-100)")).toBeInTheDocument();
  });

  it("renders Yardeni threat bands when yardeni is active", () => {
    window.localStorage.setItem("risk-framework", "yardeni");

    render(
      <FrameworkProvider>
        <ThreatLegend />
      </FrameworkProvider>,
    );

    expect(screen.getByText("LOW (0-30)")).toBeInTheDocument();
    expect(screen.getByText("ELEVATED (31-55)")).toBeInTheDocument();
    expect(screen.getByText("HIGH (56-80)")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL (81-100)")).toBeInTheDocument();
  });

  it("renders four items for Yardeni framework", () => {
    window.localStorage.setItem("risk-framework", "yardeni");

    render(
      <FrameworkProvider>
        <ThreatLegend />
      </FrameworkProvider>,
    );

    const items = screen.getAllByTestId("legend-item");
    expect(items).toHaveLength(4);
  });
});
