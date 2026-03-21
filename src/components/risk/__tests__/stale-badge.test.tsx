import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaleBadge } from "@/components/risk/stale-badge";

describe("StaleBadge", () => {
  it("renders 'Data stale' text with last updated time", () => {
    render(<StaleBadge lastSuccess="2026-03-19T10:00:00Z" />);

    const badge = screen.getByTestId("stale-badge");
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain("Data stale");
  });

  it("shows formatted last updated time", () => {
    render(<StaleBadge lastSuccess="2026-03-19T10:00:00Z" />);

    const badge = screen.getByTestId("stale-badge");
    expect(badge.textContent).toMatch(/last updated/i);
  });

  it("shows 'never' when last_success is null", () => {
    render(<StaleBadge lastSuccess={null} />);

    const badge = screen.getByTestId("stale-badge");
    expect(badge.textContent).toMatch(/never/i);
  });

  it("uses orange color (#f97316)", () => {
    render(<StaleBadge lastSuccess="2026-03-19T10:00:00Z" />);

    const badge = screen.getByTestId("stale-badge");
    expect(badge.style.color).toBe("rgb(249, 115, 22)");
  });

  it("uses 9px font size and JetBrains Mono font", () => {
    render(<StaleBadge lastSuccess="2026-03-19T10:00:00Z" />);

    const badge = screen.getByTestId("stale-badge");
    expect(badge.style.fontSize).toBe("9px");
    expect(badge.style.fontFamily).toContain("JetBrains Mono");
  });

  it("does not render when not stale (renders nothing)", () => {
    const { container } = render(
      <StaleBadge lastSuccess={null} visible={false} />,
    );

    expect(screen.queryByTestId("stale-badge")).toBeNull();
  });
});
