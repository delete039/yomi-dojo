import { expect, test } from "@playwright/test";
import { preparePage } from "./helpers";

test("reloads the typing shell from the service worker while offline", async ({
  page,
  context,
}) => {
  await preparePage(page);
  await page.goto("/#/type");
  await page.waitForSelector(".ty-word, .ty-result, .ty-empty-state");

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    null,
    { timeout: 15_000 },
  );

  try {
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.locator(".ty-word, .ty-result, .ty-empty-state"),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(() => navigator.serviceWorker.controller !== null),
      )
      .toBe(true);
  } finally {
    await context.setOffline(false);
  }
});
