import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Page } from "@playwright/test";

export const golden = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/test/fixtures/analyze-golden.json",
    ),
    "utf8",
  ),
) as {
  routes: Array<{
    id: string;
    checkpoints: Array<{
      index: number;
      mile: number;
      lng: number;
      lat: number;
      eta_local: string;
      weather: { wind_mph: number } | null;
    }>;
  }>;
};

export const heatmapGolden = JSON.parse(
  readFileSync(
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      "../src/test/fixtures/heatmap-golden.json",
    ),
    "utf8",
  ),
);

export async function mockApis(
  page: Page,
  analyzeBody: unknown = golden,
  analyzeStatus = 200,
  heatmapBody: unknown = heatmapGolden,
  heatmapStatus = 200,
) {
  // Blank-style e2e still boots Mapbox GL, which pings token/events endpoints.
  // Stub them so CI can use pk.e2e-blank-style without auth revoke noise.
  await page.route("**/api.mapbox.com/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "{}",
    });
  });
  await page.route("**/events.mapbox.com/**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

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
          wind_mph: {
            bands: [
              {
                level: "LOW",
                value: 1,
                lower: null,
                upper: 25,
                lower_inclusive: true,
                upper_inclusive: false,
              },
              {
                level: "NO_TRAVEL",
                value: 5,
                lower: 55,
                upper: null,
                lower_inclusive: true,
                upper_inclusive: true,
              },
            ],
          },
          rain_in_hr: {
            bands: [
              {
                level: "LOW",
                value: 1,
                lower: null,
                upper: 0.1,
                lower_inclusive: true,
                upper_inclusive: false,
              },
              {
                level: "NO_TRAVEL",
                value: 5,
                lower: 1,
                upper: null,
                lower_inclusive: false,
                upper_inclusive: true,
              },
            ],
          },
          snow_in_hr: {
            bands: [
              {
                level: "LOW",
                value: 1,
                lower: null,
                upper: 0.5,
                lower_inclusive: true,
                upper_inclusive: false,
              },
              {
                level: "NO_TRAVEL",
                value: 5,
                lower: 3,
                upper: null,
                lower_inclusive: false,
                upper_inclusive: true,
              },
            ],
          },
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
        ],
        units: { wind: "mph", load: "lb", rain: "in/hr", snow: "in/hr" },
        version: "1.0.0",
      }),
    });
  });

  await page.route("**/api/geocode**", async (route) => {
    const url = new URL(route.request().url());
    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const places = [
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
    ];
    const hits = places.filter((p) =>
      p.label.toLowerCase().includes(q.slice(0, 3)),
    );
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

  await page.route("**/api/heatmap", async (route) => {
    await route.fulfill({
      status: heatmapStatus,
      contentType: "application/json",
      body: JSON.stringify(heatmapBody),
    });
  });
}

export async function fillAndAnalyze(page: Page) {
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

export async function waitForMap(page: Page) {
  await page.waitForSelector('[data-testid="map-canvas-root"][data-map-status="ready"]', {
    timeout: 60_000,
  });
  await page.waitForFunction(
    () => Boolean(window.__map?.isStyleLoaded()),
    undefined,
    { timeout: 30_000 },
  );
}
