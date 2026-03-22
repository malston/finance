import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Will be created at src/lib/framework-context.tsx
import { FrameworkProvider, useFramework } from "@/lib/framework-context";

function TestConsumer() {
  const { framework, setFramework } = useFramework();
  return (
    <div>
      <span data-testid="current-framework">{framework}</span>
      <button onClick={() => setFramework("yardeni")}>Switch to Yardeni</button>
      <button onClick={() => setFramework("bookstaber")}>
        Switch to Bookstaber
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.removeItem("risk-framework");
});

afterEach(() => {
  window.localStorage.removeItem("risk-framework");
});

describe("FrameworkProvider", () => {
  it("defaults to bookstaber when localStorage is empty", () => {
    render(
      <FrameworkProvider>
        <TestConsumer />
      </FrameworkProvider>,
    );

    expect(screen.getByTestId("current-framework")).toHaveTextContent(
      "bookstaber",
    );
  });

  it("reads initial value from localStorage", () => {
    window.localStorage.setItem("risk-framework", "yardeni");

    render(
      <FrameworkProvider>
        <TestConsumer />
      </FrameworkProvider>,
    );

    expect(screen.getByTestId("current-framework")).toHaveTextContent(
      "yardeni",
    );
  });

  it("writes to localStorage when framework changes", async () => {
    const user = userEvent.setup();

    render(
      <FrameworkProvider>
        <TestConsumer />
      </FrameworkProvider>,
    );

    await user.click(screen.getByText("Switch to Yardeni"));

    expect(window.localStorage.getItem("risk-framework")).toBe("yardeni");
  });

  it("updates context value when setFramework is called", async () => {
    const user = userEvent.setup();

    render(
      <FrameworkProvider>
        <TestConsumer />
      </FrameworkProvider>,
    );

    expect(screen.getByTestId("current-framework")).toHaveTextContent(
      "bookstaber",
    );

    await user.click(screen.getByText("Switch to Yardeni"));

    expect(screen.getByTestId("current-framework")).toHaveTextContent(
      "yardeni",
    );
  });

  it("defaults to bookstaber for invalid localStorage value", () => {
    window.localStorage.setItem("risk-framework", "invalid-framework");

    render(
      <FrameworkProvider>
        <TestConsumer />
      </FrameworkProvider>,
    );

    expect(screen.getByTestId("current-framework")).toHaveTextContent(
      "bookstaber",
    );
  });

  it("can switch back to bookstaber from yardeni", async () => {
    const user = userEvent.setup();

    render(
      <FrameworkProvider>
        <TestConsumer />
      </FrameworkProvider>,
    );

    await user.click(screen.getByText("Switch to Yardeni"));
    expect(screen.getByTestId("current-framework")).toHaveTextContent(
      "yardeni",
    );

    await user.click(screen.getByText("Switch to Bookstaber"));
    expect(screen.getByTestId("current-framework")).toHaveTextContent(
      "bookstaber",
    );
    expect(window.localStorage.getItem("risk-framework")).toBe("bookstaber");
  });
});
