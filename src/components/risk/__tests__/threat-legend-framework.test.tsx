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

    expect(screen.getByText("LOW (0\u201325)")).toBeInTheDocument();
    expect(screen.getByText("ELEVATED (>25\u201350)")).toBeInTheDocument();
    expect(screen.getByText("HIGH (>50\u201375)")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL (>75\u2013100)")).toBeInTheDocument();
  });

  it("renders Yardeni threat bands when yardeni is active", () => {
    window.localStorage.setItem("risk-framework", "yardeni");

    render(
      <FrameworkProvider>
        <ThreatLegend />
      </FrameworkProvider>,
    );

    expect(screen.getByText("LOW (0\u201330)")).toBeInTheDocument();
    expect(screen.getByText("ELEVATED (>30\u201355)")).toBeInTheDocument();
    expect(screen.getByText("HIGH (>55\u201380)")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL (>80\u2013100)")).toBeInTheDocument();
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
