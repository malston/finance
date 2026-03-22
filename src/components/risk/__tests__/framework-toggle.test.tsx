import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { FrameworkProvider } from "@/lib/framework-context";
import { FrameworkToggle } from "@/components/risk/framework-toggle";

beforeEach(() => {
  window.localStorage.removeItem("risk-framework");
});

afterEach(() => {
  window.localStorage.removeItem("risk-framework");
});

function renderToggle(initialFramework?: "bookstaber" | "yardeni") {
  if (initialFramework) {
    window.localStorage.setItem("risk-framework", initialFramework);
  }
  return render(
    <FrameworkProvider>
      <FrameworkToggle />
    </FrameworkProvider>,
  );
}

describe("FrameworkToggle", () => {
  it("renders two segment options", () => {
    renderToggle();

    expect(
      screen.getByRole("button", { name: /Bookstaber/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Yardeni/i }),
    ).toBeInTheDocument();
  });

  it("renders Bookstaber label as 'Bookstaber \u2014 Systemic Risk'", () => {
    renderToggle();

    expect(
      screen.getByRole("button", { name: /Bookstaber.*Systemic Risk/i }),
    ).toBeInTheDocument();
  });

  it("renders Yardeni label as 'Yardeni \u2014 Resilience'", () => {
    renderToggle();

    expect(
      screen.getByRole("button", { name: /Yardeni.*Resilience/i }),
    ).toBeInTheDocument();
  });

  it("highlights Bookstaber segment by default", () => {
    renderToggle();

    const bookstaber = screen.getByRole("button", { name: /Bookstaber/i });
    const yardeni = screen.getByRole("button", { name: /Yardeni/i });

    expect(bookstaber).toHaveAttribute("aria-pressed", "true");
    expect(yardeni).toHaveAttribute("aria-pressed", "false");
  });

  it("switches to Yardeni on click", async () => {
    const user = userEvent.setup();
    renderToggle();

    const yardeni = screen.getByRole("button", { name: /Yardeni/i });
    await user.click(yardeni);

    expect(yardeni).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Bookstaber/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("persists selection to localStorage", async () => {
    const user = userEvent.setup();
    renderToggle();

    await user.click(screen.getByRole("button", { name: /Yardeni/i }));

    expect(window.localStorage.getItem("risk-framework")).toBe("yardeni");
  });

  it("respects initial Yardeni selection from localStorage", () => {
    renderToggle("yardeni");

    expect(screen.getByRole("button", { name: /Yardeni/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /Bookstaber/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("uses monospace font", () => {
    renderToggle();

    const toggle = screen.getByTestId("framework-toggle");
    expect(toggle.style.fontFamily).toContain("var(--font-mono)");
  });
});
