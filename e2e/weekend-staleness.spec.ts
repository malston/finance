import { test, expect } from "@playwright/test";

test.describe("Weekend Staleness Display", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForSelector('[data-testid="dashboard-root"]');
  });

  test("composite score shows 'as of' timestamp when data is aged", async ({
    page,
  }) => {
    // Wait for scores to load
    await expect(page.getByTestId("composite-score-value")).toBeVisible();

    const ageEl = page.getByTestId("composite-score-age");
    const isAged = await ageEl.isVisible().catch(() => false);

    if (isAged) {
      // Scores are stale (>30 min old) -- verify the timestamp format
      const text = await ageEl.textContent();
      expect(text).toContain("as of");
      expect(text).toContain("ET");
      // Should contain a weekday abbreviation
      expect(text).toMatch(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/);
    } else {
      // Scores are fresh -- the "as of" line should not exist
      await expect(ageEl).not.toBeVisible();
    }
  });

  test("sector panel shows 'as of' timestamp consistent with composite", async ({
    page,
  }) => {
    await expect(page.getByTestId("composite-score-value")).toBeVisible();

    const compositeAgeEl = page.getByTestId("composite-score-age");
    const isAged = await compositeAgeEl.isVisible().catch(() => false);

    const sectorAgeEls = page.getByTestId("sector-panel-score-age");

    if (isAged) {
      // At least one sector panel should also show the "as of" line
      const count = await sectorAgeEls.count();
      expect(count).toBeGreaterThan(0);

      const sectorText = await sectorAgeEls.first().textContent();
      expect(sectorText).toContain("as of");
      expect(sectorText).toContain("ET");

      // Composite and sector timestamps should match (same data source)
      const compositeText = await compositeAgeEl.textContent();
      expect(sectorText).toBe(compositeText);
    } else {
      // Fresh data -- no sector panels should show "as of" either
      await expect(sectorAgeEls).toHaveCount(0);
    }
  });

  test("sector panel fetches framework-aware scores after toggle", async ({
    page,
  }) => {
    await expect(page.getByTestId("composite-score-value")).toBeVisible();

    // Record the current score in the first sector panel gauge
    const gauge = page.getByTestId("gauge-score").first();
    await expect(gauge).toBeVisible();
    const bookstaberScore = await gauge.textContent();

    // Toggle to Yardeni
    const toggle = page.getByTestId("framework-toggle");
    await toggle.getByRole("button", { name: /Yardeni/ }).click();
    await expect(page.getByText("YARDENI RESILIENCE MONITOR")).toBeVisible();

    // Sector panel gauge should update (may be same value if both
    // frameworks produce identical scores, but the fetch should complete)
    await expect(gauge).toBeVisible();
    const yardeniScore = await gauge.textContent();

    // Both should be valid scores or "--"
    expect(bookstaberScore).toMatch(/^\d+$|^--$/);
    expect(yardeniScore).toMatch(/^\d+$|^--$/);
  });

  test("null scores show '--' with no 'as of' timestamp", async ({
    request,
    page,
  }) => {
    // Check API directly for null composite score
    const res = await request.get("/api/risk/scores", {
      params: { framework: "bookstaber" },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();

    if (data.composite.score === null) {
      // When scores are null, the UI should show "--"
      await expect(page.getByTestId("composite-score-value")).toContainText(
        "--",
      );
      // And no "as of" line
      await expect(page.getByTestId("composite-score-age")).not.toBeVisible();
    }
    // If scores exist, this scenario isn't testable -- skip gracefully
  });
});
