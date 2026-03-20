import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import DashboardPage from "@/app/page";

afterEach(() => {
  cleanup();
});

describe("Dashboard page", () => {
  it("renders the header with app title", () => {
    render(<DashboardPage />);
    expect(screen.getByText("BOOKSTABER RISK MONITOR")).toBeInTheDocument();
  });

  it("renders the header subtitle", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/Systemic contagion tracker/)).toBeInTheDocument();
  });

  it("renders the diamond icon in the header", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/◈/)).toBeInTheDocument();
  });

  it("renders a live clock display", () => {
    render(<DashboardPage />);
    // The clock should show a time string with AM/PM or 24h format
    // Look for the date display (e.g., "Thu, Mar 20, 2026")
    const dateElement = screen.getByTestId("header-date");
    expect(dateElement).toBeInTheDocument();
    expect(dateElement.textContent).toBeTruthy();

    const timeElement = screen.getByTestId("header-time");
    expect(timeElement).toBeInTheDocument();
    expect(timeElement.textContent).toBeTruthy();
  });

  it("renders placeholder sections for composite threat, correlation chart, and sector panels", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("section-composite-threat")).toBeInTheDocument();
    expect(screen.getByTestId("section-correlation-chart")).toBeInTheDocument();
    expect(screen.getByTestId("section-sector-panels")).toBeInTheDocument();
  });

  it("applies the dark background color", () => {
    render(<DashboardPage />);
    const root = screen.getByTestId("dashboard-root");
    expect(root).toBeInTheDocument();
    // The root element should have the bg color style or class
    const style = root.style;
    expect(style.backgroundColor).toBe("rgb(10, 14, 23)");
  });

  it("renders with max-width 960px centered container", () => {
    render(<DashboardPage />);
    const container = screen.getByTestId("dashboard-content");
    expect(container.style.maxWidth).toBe("960px");
  });

  it("renders the prototype data notice", () => {
    render(<DashboardPage />);
    expect(screen.getByText(/SIMULATED DATA/)).toBeInTheDocument();
  });

  it("renders the Treasury & Credit Spreads card", () => {
    render(<DashboardPage />);
    expect(screen.getByTestId("treasury-credit-card")).toBeInTheDocument();
  });
});
