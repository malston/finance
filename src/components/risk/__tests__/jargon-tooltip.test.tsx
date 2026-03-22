import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JargonTooltip, annotateText } from "@/components/risk/jargon-tooltip";
import { JARGON_DEFINITIONS } from "@/lib/jargon";

describe("JargonTooltip", () => {
  it("renders the term text as visible content", () => {
    render(<JargonTooltip term="VIX" />);
    expect(screen.getByText("VIX")).toBeInTheDocument();
  });

  it("applies dotted underline to the term", () => {
    render(<JargonTooltip term="VIX" />);
    const trigger = screen.getByTestId("jargon-trigger");
    expect(trigger.style.borderBottom).toContain("dotted");
  });

  it("shows tooltip content on hover", async () => {
    const user = userEvent.setup();
    render(<JargonTooltip term="VIX" />);

    const trigger = screen.getByTestId("jargon-trigger");
    await user.hover(trigger);

    const tooltip = screen.getByTestId("jargon-tooltip-content");
    expect(tooltip).toBeInTheDocument();
    expect(tooltip.textContent).toContain(JARGON_DEFINITIONS["VIX"]);
  });

  it("applies dark theme styling to tooltip (#111827 bg, #e2e8f0 text)", async () => {
    const user = userEvent.setup();
    render(<JargonTooltip term="BDC" />);

    const trigger = screen.getByTestId("jargon-trigger");
    await user.hover(trigger);

    const tooltip = screen.getByTestId("jargon-tooltip-content");
    expect(tooltip.style.backgroundColor).toBe("rgb(17, 24, 39)");
    expect(tooltip.style.color).toBe("rgb(226, 232, 240)");
  });

  it("renders children as the trigger text when provided", () => {
    render(<JargonTooltip term="VIX">Fear Index (VIX)</JargonTooltip>);
    expect(screen.getByText("Fear Index (VIX)")).toBeInTheDocument();
  });

  it("falls back to term as display text when no children", () => {
    render(<JargonTooltip term="MOVE" />);
    expect(screen.getByText("MOVE")).toBeInTheDocument();
  });

  it("renders nothing special for unknown terms", () => {
    render(<JargonTooltip term="UNKNOWN_TERM" />);
    expect(screen.getByText("UNKNOWN_TERM")).toBeInTheDocument();
    // No tooltip content should exist since definition doesn't exist
    expect(screen.queryByTestId("jargon-tooltip-content")).toBeNull();
  });
});

describe("annotateText", () => {
  it("wraps known jargon terms with tooltip triggers", () => {
    render(<span>{annotateText("BDC discounts, HY spreads")}</span>);
    const triggers = screen.getAllByTestId("jargon-trigger");
    expect(triggers).toHaveLength(2);
    expect(triggers[0].textContent).toBe("BDC");
    expect(triggers[1].textContent).toBe("HY");
  });

  it("preserves non-jargon text between terms", () => {
    const { container } = render(
      <span>{annotateText("BDC discounts, HY spreads")}</span>,
    );
    expect(container.textContent).toBe("BDC discounts, HY spreads");
  });

  it("wraps VIX and MOVE in contagion description", () => {
    render(
      <span>
        {annotateText("Rolling correlations across sectors, VIX, MOVE")}
      </span>,
    );
    const triggers = screen.getAllByTestId("jargon-trigger");
    const triggerTexts = triggers.map((t) => t.textContent);
    expect(triggerTexts).toContain("VIX");
    expect(triggerTexts).toContain("MOVE");
  });

  it("returns plain text when no jargon is found", () => {
    const { container } = render(
      <span>{annotateText("Crude, natural gas, shipping")}</span>,
    );
    expect(container.textContent).toBe("Crude, natural gas, shipping");
    expect(screen.queryByTestId("jargon-trigger")).toBeNull();
  });
});
