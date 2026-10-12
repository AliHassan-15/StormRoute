import { expect, test } from "@playwright/test";

import {
  fillAndAnalyze,
  golden,
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

test.describe("Map experience", () => {
  test.describe.configure({ timeout: 120_000 });

  test("canvas renders, selection widths, checkpoint drawer, theme, arrows", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await mockApis(page);
    await page.goto("/?e2e=1");
    await waitForMap(page);
    await expect(page.getByTestId("map-controls")).toBeVisible();

    await fillAndAnalyze(page);
    await expect(page.getByTestId("results-panel")).toBeVisible({
      timeout: 15_000,
    });
    await page.waitForFunction(
      () => Boolean(window.__map?.getLayer("routes-base")),
      undefined,
      { timeout: 30_000 },
    );

    // Selecting a non-recommended card changes line widths via paint props.
    await page.getByTestId("route-card-A").click();
    await page.waitForFunction(
      () => {
        const map = window.__map;
        if (!map?.isStyleLoaded()) return false;
        try {
          const widthExpr = map.getPaintProperty("routes-base", "line-width");
          return JSON.stringify(widthExpr).includes('"A"');
        } catch {
          return false;
        }
      },
      undefined,
      { timeout: 20_000 },
    );

    // Click checkpoint on the map (golden route C origin after reselect).
    await page.getByTestId("route-card-C").click();
    await page.waitForTimeout(400);
    const routeC = golden.routes.find((r) => r.id === "C")!;
    const cp0 = routeC.checkpoints[0]!;
    await page.evaluate(
      ([lng, lat]) => {
        const map = window.__map!;
        map.jumpTo({ center: [lng, lat], zoom: 8 });
      },
      [cp0.lng, cp0.lat] as [number, number],
    );
    await page.waitForTimeout(400);
    const hit = await page.evaluate(
      ([lng, lat]) => {
        const map = window.__map!;
        const p = map.project([lng, lat] as [number, number]);
        const feats = map.queryRenderedFeatures(p, {
          layers: ["checkpoints-circle"].filter((id) => map.getLayer(id)),
        });
        return { x: p.x, y: p.y, count: feats.length };
      },
      [cp0.lng, cp0.lat] as [number, number],
    );
    if (hit.count > 0) {
      const box = await page.getByTestId("map-canvas").boundingBox();
      expect(box).toBeTruthy();
      await page.mouse.click(box!.x + hit.x, box!.y + hit.y);
    }
    if (!(await page.getByTestId("checkpoint-drawer").isVisible().catch(() => false))) {
      await page.getByRole("tab", { name: /checkpoints/i }).click();
      await page.getByRole("button", { name: /0 mi/i }).first().click();
    }
    await expect(page.getByTestId("checkpoint-drawer")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("checkpoint-drawer-body")).toContainText(
      String(Math.round(cp0.weather?.wind_mph ?? 10)),
    );
    await expect(page.getByTestId("checkpoint-drawer-body")).toContainText(
      "07:00",
    );

    const layersBefore = await page.evaluate(() =>
      window.__mapController!.getCustomLayerIds().sort(),
    );
    for (let i = 0; i < 5; i += 1) {
      await page.getByTestId("theme-toggle").click();
      await page.waitForFunction(
        () =>
          Boolean(
            window.__map?.isStyleLoaded() &&
              window.__map?.getLayer("routes-base"),
          ),
        undefined,
        { timeout: 15_000 },
      );
    }
    const layersAfter = await page.evaluate(() =>
      window.__mapController!.getCustomLayerIds().sort(),
    );
    expect(layersAfter).toEqual(layersBefore);

    // Left/Right keys move between checkpoints
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("checkpoint-drawer-body")).toContainText(
      "25 mi",
    );
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("checkpoint-drawer-body")).toContainText(
      "0 mi",
    );

    const relevantErrors = consoleErrors.filter(
      (e) =>
        !/Download the React DevTools/i.test(e) &&
        !/\[vite\]/i.test(e) &&
        !/favicon/i.test(e) &&
        !/events\.mapbox\.com/i.test(e) &&
        !/Access to fetch/i.test(e) &&
        !/Failed to load resource/i.test(e) &&
        !/net::ERR/i.test(e),
    );
    expect(relevantErrors).toEqual([]);
  });
});
