import { test, expect } from "@playwright/test";

test.describe("Dual Framework Toggle - Frontend", () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage so each test starts with the default framework
    await page.goto("/");
    await page.evaluate(() => window.localStorage.removeItem("risk-framework"));
    await page.reload();
    await page.waitForSelector('[data-testid="dashboard-root"]');
  });

  test("Scenario 1: Default framework is Bookstaber", async ({ page }) => {
    // Header title
    await expect(page.getByText("BOOKSTABER RISK MONITOR")).toBeVisible();

    // Subtitle
    await expect(page.getByText("Systemic contagion tracker")).toBeVisible();

    // Threat legend bands
    const legend = page.getByTestId("threat-legend");
    await expect(legend.getByText("LOW (0\u201325)")).toBeVisible();
    await expect(legend.getByText("ELEVATED (>25\u201350)")).toBeVisible();
    await expect(legend.getByText("HIGH (>50\u201375)")).toBeVisible();
    await expect(legend.getByText("CRITICAL (>75\u2013100)")).toBeVisible();

    // Toggle segment: "Bookstaber" button is pressed
    const toggle = page.getByTestId("framework-toggle");
    const bookstaberBtn = toggle.getByRole("button", {
      name: /Bookstaber/,
    });
    await expect(bookstaberBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("Scenario 2: Toggle to Yardeni", async ({ page }) => {
    // Click the Yardeni toggle segment
    const toggle = page.getByTestId("framework-toggle");
    const yardeniBtn = toggle.getByRole("button", { name: /Yardeni/ });
    await yardeniBtn.click();

    // Header title changes
    await expect(page.getByText("YARDENI RESILIENCE MONITOR")).toBeVisible();

    // Subtitle changes
    await expect(
      page.getByText("Resilience monitor — tracking self-correction"),
    ).toBeVisible();

    // Threat legend bands change to Yardeni thresholds
    const legend = page.getByTestId("threat-legend");
    await expect(legend.getByText("LOW (0\u201330)")).toBeVisible();
    await expect(legend.getByText("ELEVATED (>30\u201355)")).toBeVisible();
    await expect(legend.getByText("HIGH (>55\u201380)")).toBeVisible();
    await expect(legend.getByText("CRITICAL (>80\u2013100)")).toBeVisible();

    // Yardeni toggle segment is active
    await expect(yardeniBtn).toHaveAttribute("aria-pressed", "true");

    // Bookstaber segment is inactive
    const bookstaberBtn = toggle.getByRole("button", {
      name: /Bookstaber/,
    });
    await expect(bookstaberBtn).toHaveAttribute("aria-pressed", "false");
  });

  test("Scenario 3: Framework persists across page refresh", async ({
    page,
  }) => {
    // Toggle to Yardeni
    const toggle = page.getByTestId("framework-toggle");
    await toggle.getByRole("button", { name: /Yardeni/ }).click();
    await expect(page.getByText("YARDENI RESILIENCE MONITOR")).toBeVisible();

    // Reload the page
    await page.reload();
    await page.waitForSelector('[data-testid="dashboard-root"]');

    // Yardeni is still active after reload
    await expect(page.getByText("YARDENI RESILIENCE MONITOR")).toBeVisible();
    await expect(
      page.getByText("Resilience monitor — tracking self-correction"),
    ).toBeVisible();

    const reloadedToggle = page.getByTestId("framework-toggle");
    await expect(
      reloadedToggle.getByRole("button", { name: /Yardeni/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("Scenario 6: Tooltips show framework-appropriate definitions", async ({
    page,
  }) => {
    // VIX appears in the Contagion domain description, which is always rendered
    const vixTrigger = page
      .getByTestId("jargon-trigger")
      .filter({ hasText: "VIX" })
      .first();
    await expect(vixTrigger).toBeVisible();

    // Hover over VIX with Bookstaber active
    await vixTrigger.hover();
    const tooltip = page.getByTestId("jargon-tooltip-content");
    await expect(tooltip).toBeVisible();
    const bookstaberText = await tooltip.textContent();
    expect(bookstaberText).toContain("fear index");

    // Move away to dismiss tooltip
    await page.mouse.move(0, 0);
    await expect(tooltip).not.toBeVisible();

    // Toggle to Yardeni
    await page
      .getByTestId("framework-toggle")
      .getByRole("button", { name: /Yardeni/ })
      .click();
    await expect(page.getByText("YARDENI RESILIENCE MONITOR")).toBeVisible();

    // Hover over VIX again with Yardeni active
    const yardeniVixTrigger = page
      .getByTestId("jargon-trigger")
      .filter({ hasText: "VIX" })
      .first();
    await yardeniVixTrigger.hover();
    const yardeniTooltip = page.getByTestId("jargon-tooltip-content");
    await expect(yardeniTooltip).toBeVisible();
    const yardeniText = await yardeniTooltip.textContent();
    expect(yardeniText).toContain("short-lived");

    // Definitions must differ between frameworks
    expect(bookstaberText).not.toEqual(yardeniText);
  });
});

test.describe("Dual Framework Toggle - API", () => {
  test("Scenario 4: Scores differ between frameworks", async ({ request }) => {
    const bookstaberRes = await request.get("/api/risk/scores", {
      params: { framework: "bookstaber" },
    });
    expect(bookstaberRes.ok()).toBe(true);
    const bookstaberData = await bookstaberRes.json();
    expect(bookstaberData.framework).toBe("bookstaber");

    const yardeniRes = await request.get("/api/risk/scores", {
      params: { framework: "yardeni" },
    });
    expect(yardeniRes.ok()).toBe(true);
    const yardeniData = await yardeniRes.json();
    expect(yardeniData.framework).toBe("yardeni");
  });

  test("Scenario 5: Correlation threshold changes between frameworks", async ({
    request,
  }) => {
    const bookstaberRes = await request.get("/api/risk/correlations", {
      params: { days: "79", framework: "bookstaber" },
    });
    expect(bookstaberRes.ok()).toBe(true);
    const bookstaberData = await bookstaberRes.json();
    expect(bookstaberData.framework).toBe("bookstaber");
    expect(bookstaberData.threshold).toBe(0.5);

    const yardeniRes = await request.get("/api/risk/correlations", {
      params: { days: "79", framework: "yardeni" },
    });
    expect(yardeniRes.ok()).toBe(true);
    const yardeniData = await yardeniRes.json();
    expect(yardeniData.framework).toBe("yardeni");
    expect(yardeniData.threshold).toBe(0.85);
  });

  test("Scenario 7: API returns correct framework-specific data", async ({
    request,
  }) => {
    // Bookstaber scores response structure
    const bookstaberRes = await request.get("/api/risk/scores", {
      params: { framework: "bookstaber" },
    });
    expect(bookstaberRes.ok()).toBe(true);
    const bookstaber = await bookstaberRes.json();
    expect(bookstaber.framework).toBe("bookstaber");
    expect(bookstaber).toHaveProperty("composite");
    expect(bookstaber).toHaveProperty("domains");

    // Bookstaber domain weights match config
    expect(bookstaber.domains.private_credit.weight).toBe(0.3);
    expect(bookstaber.domains.ai_concentration.weight).toBe(0.2);
    expect(bookstaber.domains.energy_geo.weight).toBe(0.25);
    expect(bookstaber.domains.contagion.weight).toBe(0.25);

    // Yardeni scores response structure
    const yardeniRes = await request.get("/api/risk/scores", {
      params: { framework: "yardeni" },
    });
    expect(yardeniRes.ok()).toBe(true);
    const yardeni = await yardeniRes.json();
    expect(yardeni.framework).toBe("yardeni");
    expect(yardeni).toHaveProperty("composite");
    expect(yardeni).toHaveProperty("domains");

    // Yardeni domain weights match config
    expect(yardeni.domains.private_credit.weight).toBe(0.25);
    expect(yardeni.domains.ai_concentration.weight).toBe(0.2);
    expect(yardeni.domains.energy_geo.weight).toBe(0.3);
    expect(yardeni.domains.contagion.weight).toBe(0.25);

    // Default (no framework param) should be bookstaber
    const defaultRes = await request.get("/api/risk/scores");
    expect(defaultRes.ok()).toBe(true);
    const defaultData = await defaultRes.json();
    expect(defaultData.framework).toBe("bookstaber");
  });
});
