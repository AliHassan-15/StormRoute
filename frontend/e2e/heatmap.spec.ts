import { expect, test } from "@playwright/test";

import {
  fillAndAnalyze,
  golden,
  heatmapGolden,
  mockApis,
  waitForMap,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      localStorage.clear();
      localStorage.setItem("stormroute-e2e", "1");
    } catch {
      /* ignore */
    }
  });
});

test.describe("Heatmap dock + map layer", () => {
  test.describe.configure({ timeout: 120_000 });

  test("dock, slider paint, zero network while dragging, play, legend, retry, 375px", async ({
    page,
  }) => {
    await mockApis(page);
    await page.goto("/?e2e=1");
    await waitForMap(page);

    await fillAndAnalyze(page);
    await expect(page.getByTestId("results-panel")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("heatmap-dock")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("heatmap-slider")).toBeVisible({
      timeout: 15_000,
    });

    await page.waitForFunction(
      () => Boolean(window.__map?.getLayer("heatmap")),
      undefined,
      { timeout: 30_000 },
    );

    const weightBefore = await page.evaluate(() =>
      JSON.stringify(
        window.__map!.getPaintProperty("heatmap", "heatmap-weight"),
      ),
    );

    let heatmapRequests = 0;
    page.on("request", (req) => {
      if (req.url().includes("/api/heatmap")) heatmapRequests += 1;
    });

    const slider = page.getByTestId("heatmap-slider");
    await slider.fill("12");
    await page.waitForTimeout(150);

    const weightAfter = await page.evaluate(() =>
      JSON.stringify(
        window.__map!.getPaintProperty("heatmap", "heatmap-weight"),
      ),
    );
    expect(weightAfter).not.toEqual(weightBefore);
    expect(weightAfter).toContain("12");

    // Drag / scrub without new heatmap network calls.
    heatmapRequests = 0;
    for (const h of [18, 24, 30]) {
      await slider.fill(String(h));
    }
    await page.waitForTimeout(200);
    expect(heatmapRequests).toBe(0);

    // Play advances ~3 hours in 3s at 1x.
    await page.getByRole("button", { name: "1x" }).click();
    const hourStart = Number(await slider.inputValue());
    await page.getByTestId("heatmap-play").click();
    await page.waitForTimeout(3200);
    await page.getByTestId("heatmap-play").click();
    const hourEnd = Number(await slider.inputValue());
    expect(hourEnd - hourStart).toBeGreaterThanOrEqual(2);
    expect(hourEnd - hourStart).toBeLessThanOrEqual(5);

    // Layer switch changes legend units/labels.
    const legend = page.getByTestId("heatmap-legend");
    await expect(legend).toContainText(/level/i);
    await page.getByRole("radio", { name: "Wind" }).click();
    await expect(legend).toContainText(/mph/i);
    await page.getByRole("radio", { name: "Rain" }).click();
    await expect(legend).toContainText(/in\/hr/i);

    // 375 px layout
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByTestId("heatmap-dock")).toBeVisible();
    await expect(page.getByTestId("heatmap-slider")).toBeVisible();
  });

  test("heatmap error then Retry works", async ({ page }) => {
    let failOnce = true;
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
          load_rules: [],
          units: { wind: "mph", load: "lb", rain: "in/hr", snow: "in/hr" },
          version: "1.0.0",
        }),
      });
    });
    await page.route("**/api/geocode**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: "dal",
            label: "Dallas, Texas, United States",
            lat: 32.7767,
            lng: -96.797,
          },
          {
            id: "chi",
            label: "Chicago, Illinois, United States",
            lat: 41.8781,
            lng: -87.6298,
          },
        ]),
      });
    });
    await page.route("**/api/analyze", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(golden),
      });
    });
    await page.route("**/api/heatmap", async (route) => {
      if (failOnce) {
        failOnce = false;
        await route.fulfill({
          status: 502,
          contentType: "application/json",
          body: JSON.stringify({
            error: { code: "UPSTREAM_BAD_GATEWAY", message: "Weather down" },
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(heatmapGolden),
      });
    });

    await page.goto("/?e2e=1");
    await waitForMap(page);
    await fillAndAnalyze(page);
    await expect(page.getByTestId("heatmap-dock-error")).toBeVisible({
      timeout: 15_000,
    });
    await page.getByTestId("heatmap-retry").click();
    await expect(page.getByTestId("heatmap-slider")).toBeVisible({
      timeout: 15_000,
    });
  });
});
