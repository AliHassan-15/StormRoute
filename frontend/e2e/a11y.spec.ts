import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { fillAndAnalyze, mockApis, waitForMap } from "./helpers";

async function expectNoSeriousAxe(page: Page, name: string) {
  // Disable animated opacity / font smoothing noise before sampling contrast.
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        -webkit-font-smoothing: antialiased !important;
      }
      [data-testid^="route-card-"] { opacity: 1 !important; }
    `,
  });
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const bad = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(bad, `${name}: ${JSON.stringify(bad, null, 2)}`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem("stormroute-e2e", "1");
      // Deterministic AA checks (control-room default).
      localStorage.setItem("stormroute-theme", "dark");
    } catch {
      /* ignore */
    }
    document.documentElement.classList.remove("light");
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.theme = "dark";
    document.documentElement.style.colorScheme = "dark";
  });
});

test.describe("Accessibility (axe)", () => {
  test.describe.configure({ timeout: 120_000 });

  test("empty, form, results, drawer, heatmap — zero serious/critical", async ({
    page,
  }) => {
    await mockApis(page);
    await page.goto("/?e2e=1");
    await waitForMap(page);

    await expect(page.getByTestId("results-empty")).toBeVisible({
      timeout: 15_000,
    });
    await expectNoSeriousAxe(page, "empty");

    await expect(page.getByRole("button", { name: /analyze routes/i })).toBeVisible();
    await expectNoSeriousAxe(page, "form");

    await fillAndAnalyze(page);
    await expect(page.getByTestId("results-panel")).toBeVisible({
      timeout: 15_000,
    });
    await expectNoSeriousAxe(page, "results");

    await page.getByRole("tab", { name: /checkpoints/i }).click();
    await page.getByRole("button", { name: /0 mi/i }).first().click();
    await expect(page.getByTestId("checkpoint-drawer")).toBeVisible({
      timeout: 10_000,
    });
    await expectNoSeriousAxe(page, "drawer");

    await page.keyboard.press("Escape");
    await expect(page.getByTestId("heatmap-slider")).toBeVisible({
      timeout: 15_000,
    });
    await expectNoSeriousAxe(page, "heatmap");
  });
});
