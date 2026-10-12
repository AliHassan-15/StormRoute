import { expect, test } from "@playwright/test";

const viewports = [
  { name: "375", width: 375, height: 812 },
  { name: "768", width: 768, height: 1024 },
  { name: "1440", width: 1440, height: 900 },
] as const;

const themes = ["dark", "light"] as const;

for (const theme of themes) {
  for (const viewport of viewports) {
    test(`design system ${theme} ${viewport.name}`, async ({ page }) => {
      await page.addInitScript((mode) => {
        localStorage.setItem("stormroute-theme", mode);
      }, theme);

      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.goto("/design");
      await expect(page.getByTestId("design-system")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);

      await expect(page).toHaveScreenshot(`design-${theme}-${viewport.name}.png`, {
        fullPage: true,
        animations: "disabled",
      });
    });
  }
}
