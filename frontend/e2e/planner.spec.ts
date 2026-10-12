import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test, type Page } from "@playwright/test";

const golden = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/test/fixtures/analyze-golden.json",
    ),
    "utf8",
  ),
) as unknown;

async function mockApis(page: Page, analyzeBody: unknown = golden, analyzeStatus = 200) {
  await page.route("**/api/meta", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        levels: [
          { value: 1, name: "LOW", label: "Low" },
          { value: 2, name: "MODERATE", label: "Moderate" },
          { value: 3, name: "HIGH", label: "High" },
          { value: 4, name: "SEVERE", label: "Severe" },
          { value: 5, name: "NO_TRAVEL", label: "No Travel" },
        ],
        thresholds: {
          wind_mph: { bands: [] },
          rain_in_hr: { bands: [] },
          snow_in_hr: { bands: [] },
        },
        load_rules: [
          {
            id: "wind_gte_55_any_load",
            wind_lower: 55,
            wind_upper: null,
            wind_lower_inclusive: true,
            wind_upper_inclusive: true,
            load_gt_lb: null,
            raises_to: "NO_TRAVEL",
            raises_to_value: 5,
            description: "Wind >=55 mph: No Travel for any load",
          },
          {
            id: "wind_45_54_load_gt_30000",
            wind_lower: 45,
            wind_upper: 55,
            wind_lower_inclusive: true,
            wind_upper_inclusive: false,
            load_gt_lb: 30000,
            raises_to: "NO_TRAVEL",
            raises_to_value: 5,
            description: "Wind 45-54 mph and load >30,000 lb: No Travel",
          },
        ],
        units: { wind: "mph", load: "lb" },
        version: "1.0.0",
      }),
    });
  });

  await page.route("**/api/geocode**", async (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const places = [
      { id: "dal", label: "Dallas, Texas, United States", lat: 32.7767, lng: -96.797 },
      { id: "chi", label: "Chicago, Illinois, United States", lat: 41.8781, lng: -87.6298 },
      { id: "den", label: "Denver, Colorado, United States", lat: 39.7392, lng: -104.9903 },
    ];
    const hits = places.filter((p) => p.label.toLowerCase().includes(q.slice(0, 3)));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(hits.length ? hits : places.slice(0, 1)),
    });
  });

  await page.route("**/api/analyze", async (route) => {
    await route.fulfill({
      status: analyzeStatus,
      contentType: "application/json",
      body: JSON.stringify(analyzeBody),
    });
  });
}

async function fillAndAnalyze(page: Page) {
  const origin = page.locator("#origin");
  await origin.fill("Dal");
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /Dallas/i })
    .first()
    .click();

  const destination = page.locator("#destination");
  await destination.fill("Chi");
  await page
    .getByRole("listbox")
    .getByRole("option", { name: /Chicago/i })
    .first()
    .click();

  await page.getByRole("button", { name: /analyze routes/i }).click();
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });
});

test.describe("Planner happy path", () => {
  test("shows Recommended ribbon on Route C", async ({ page }) => {
    await mockApis(page);
    await page.goto("/");
    await fillAndAnalyze(page);
    await expect(page.getByTestId("results-panel")).toBeVisible();
    await expect(page.getByTestId("route-card-C")).toContainText("Recommended");
    await expect(page.getByTestId("recommendation-banner")).toBeVisible();
  });
});

test.describe("Planner errors", () => {
  test("handles 500", async ({ page }) => {
    await mockApis(page, { error: { code: "INTERNAL", message: "boom" } }, 500);
    await page.goto("/");
    await fillAndAnalyze(page);
    await expect(page.getByTestId("analyze-error")).toBeVisible();
    await expect(page.getByTestId("analyze-error")).toHaveAttribute(
      "data-error-code",
      "INTERNAL",
    );
  });

  test("handles 429", async ({ page }) => {
    await mockApis(
      page,
      { error: { code: "UPSTREAM_RATE_LIMIT", message: "slow down" } },
      429,
    );
    await page.goto("/");
    await fillAndAnalyze(page);
    await expect(page.getByTestId("analyze-error")).toHaveAttribute(
      "data-error-code",
      "UPSTREAM_RATE_LIMIT",
    );
  });

  test("handles NO_ROUTE", async ({ page }) => {
    await mockApis(
      page,
      { error: { code: "NO_ROUTE", message: "No route found." } },
      404,
    );
    await page.goto("/");
    await fillAndAnalyze(page);
    await expect(page.getByTestId("analyze-error")).toHaveAttribute(
      "data-error-code",
      "NO_ROUTE",
    );
    await expect(page.getByText(/at least a mile apart/i)).toBeVisible();
  });
});

test.describe("Mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("happy path at 375px", async ({ page }) => {
    await mockApis(page);
    await page.goto("/");
    const sheet = page.getByTestId("mobile-planner-sheet");
    await expect(sheet).toBeVisible();
    await fillAndAnalyze(page);
    await expect(page.getByTestId("route-card-C")).toContainText("Recommended", {
      timeout: 15_000,
    });
  });
});
