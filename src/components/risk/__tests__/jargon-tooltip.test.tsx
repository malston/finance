import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JargonTooltip, annotateText } from "@/components/risk/jargon-tooltip";
import { JARGON_DEFINITIONS } from "@/lib/jargon";
import { FrameworkProvider } from "@/lib/framework-context";

/**
 * Wraps component in a FrameworkProvider with the given framework pre-selected.
 * localStorage is used by FrameworkProvider to initialize the framework value.
 */
function renderWithFramework(
  ui: React.ReactElement,
  framework: "bookstaber" | "yardeni",
) {
  window.localStorage.setItem("risk-framework", framework);
  return render(<FrameworkProvider>{ui}</FrameworkProvider>);
}

describe("JargonTooltip", () => {
  it("renders the term text as visible content", () => {
    renderWithFramework(<JargonTooltip term="VIX" />, "bookstaber");
    expect(screen.getByText("VIX")).toBeInTheDocument();
  });

  it("applies dotted underline to the term", () => {
    renderWithFramework(<JargonTooltip term="VIX" />, "bookstaber");
    const trigger = screen.getByTestId("jargon-trigger");
    expect(trigger.style.borderBottom).toContain("dotted");
  });

  it("shows bookstaber definition when framework is bookstaber", async () => {
    const user = userEvent.setup();
    renderWithFramework(<JargonTooltip term="VIX" />, "bookstaber");

    const trigger = screen.getByTestId("jargon-trigger");
    await user.hover(trigger);

    const tooltip = screen.getByTestId("jargon-tooltip-content");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toContain(JARGON_DEFINITIONS["VIX"].bookstaber);
  });

  it("shows yardeni definition when framework is yardeni", async () => {
    const user = userEvent.setup();
    renderWithFramework(<JargonTooltip term="VIX" />, "yardeni");

    const trigger = screen.getByTestId("jargon-trigger");
    await user.hover(trigger);

    const tooltip = screen.getByTestId("jargon-tooltip-content");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toContain(JARGON_DEFINITIONS["VIX"].yardeni);
  });

  it("shows correct bookstaber definition for BDC", async () => {
    const user = userEvent.setup();
    renderWithFramework(<JargonTooltip term="BDC" />, "bookstaber");

    const trigger = screen.getByTestId("jargon-trigger");
    await user.hover(trigger);

    const tooltip = screen.getByTestId("jargon-tooltip-content");
    expect(tooltip.textContent).toContain(JARGON_DEFINITIONS["BDC"].bookstaber);
  });

  it("shows correct yardeni definition for BDC", async () => {
    const user = userEvent.setup();
    renderWithFramework(<JargonTooltip term="BDC" />, "yardeni");

    const trigger = screen.getByTestId("jargon-trigger");
    await user.hover(trigger);

    const tooltip = screen.getByTestId("jargon-tooltip-content");
    expect(tooltip.textContent).toContain(JARGON_DEFINITIONS["BDC"].yardeni);
  });

  it("applies dark theme styling to tooltip (#111827 bg, #e2e8f0 text)", async () => {
    const user = userEvent.setup();
    renderWithFramework(<JargonTooltip term="BDC" />, "bookstaber");

    const trigger = screen.getByTestId("jargon-trigger");
    await user.hover(trigger);

    const tooltip = screen.getByTestId("jargon-tooltip-content");
    expect(tooltip.style.backgroundColor).toBe("rgb(17, 24, 39)");
    expect(tooltip.style.color).toBe("rgb(226, 232, 240)");
  });

  it("renders children as the trigger text when provided", () => {
    renderWithFramework(
      <JargonTooltip term="VIX">Fear Index (VIX)</JargonTooltip>,
      "bookstaber",
    );
    expect(screen.getByText("Fear Index (VIX)")).toBeInTheDocument();
  });

  it("falls back to term as display text when no children", () => {
    renderWithFramework(<JargonTooltip term="MOVE" />, "bookstaber");
    expect(screen.getByText("MOVE")).toBeInTheDocument();
  });

  it("renders nothing special for unknown terms", () => {
    renderWithFramework(<JargonTooltip term="UNKNOWN_TERM" />, "bookstaber");
    expect(screen.getByText("UNKNOWN_TERM")).toBeInTheDocument();
    expect(screen.queryByTestId("jargon-tooltip-content")).toBeNull();
  });
});

describe("annotateText", () => {
  it("wraps known jargon terms with tooltip triggers", () => {
    renderWithFramework(
      <span>{annotateText("BDC discounts, HY spreads")}</span>,
      "bookstaber",
    );
    const triggers = screen.getAllByTestId("jargon-trigger");
    expect(triggers).toHaveLength(2);
    expect(triggers[0].textContent).toBe("BDC");
    expect(triggers[1].textContent).toBe("HY");
  });

  it("preserves non-jargon text between terms", () => {
    const { container } = renderWithFramework(
      <span>{annotateText("BDC discounts, HY spreads")}</span>,
      "bookstaber",
    );
    expect(container.textContent).toBe("BDC discounts, HY spreads");
  });

  it("wraps VIX and MOVE in contagion description", () => {
    renderWithFramework(
      <span>
        {annotateText("Rolling correlations across sectors, VIX, MOVE")}
      </span>,
      "bookstaber",
    );
    const triggers = screen.getAllByTestId("jargon-trigger");
    const triggerTexts = triggers.map((t) => t.textContent);
    expect(triggerTexts).toContain("VIX");
    expect(triggerTexts).toContain("MOVE");
  });

  it("returns plain text when no jargon is found", () => {
    const { container } = renderWithFramework(
      <span>{annotateText("Crude, natural gas, shipping")}</span>,
      "bookstaber",
    );
    expect(container.textContent).toBe("Crude, natural gas, shipping");
    expect(screen.queryByTestId("jargon-trigger")).toBeNull();
  });

  it("shows framework-appropriate tooltip when hovering annotated VIX text", async () => {
    const user = userEvent.setup();
    renderWithFramework(
      <span>{annotateText("Rising VIX suggests contagion")}</span>,
      "yardeni",
    );

    const triggers = screen.getAllByTestId("jargon-trigger");
    const vixTrigger = triggers.find((t) => t.textContent === "VIX");
    expect(vixTrigger).toBeDefined();

    await user.hover(vixTrigger!);

    const tooltip = screen.getByTestId("jargon-tooltip-content");
    expect(tooltip.textContent).toContain(JARGON_DEFINITIONS["VIX"].yardeni);
  });

  it("wraps both VIX and contagion terms in annotated text", () => {
    renderWithFramework(
      <span>{annotateText("Rising VIX suggests contagion")}</span>,
      "bookstaber",
    );
    const triggers = screen.getAllByTestId("jargon-trigger");
    const triggerTexts = triggers.map((t) => t.textContent);
    expect(triggerTexts).toContain("VIX");
    expect(triggerTexts).toContain("contagion");
  });
});
