import { expect, test } from "@playwright/test";
import { currentWord, gotoType, typeKana } from "./helpers";

test.use({ viewport: { width: 390, height: 844 } });

test("mobile type page uses the five-item bottom navigation and completes a word", async ({
  page,
}, testInfo) => {
  await gotoType(page, { batchSize: 1 });

  await expect(page.locator(".ty-global-header")).toBeHidden();
  const nav = page.getByRole("navigation", { name: "移动端主导航" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("button")).toHaveCount(5);

  const box = await page.locator(".ty-container").boundingBox();
  expect(box?.width).toBeCloseTo(360, 0);
  const fontSize = await page
    .locator(".ty-word")
    .evaluate((node) => getComputedStyle(node).fontSize);
  expect(fontSize).toBe("45px");

  await page.screenshot({
    path: testInfo.outputPath("type-mobile-initial.png"),
    fullPage: true,
  });
  await typeKana(page, (await currentWord(page)).reading);
  await page.locator(".ty-result").waitFor();
  await page.screenshot({
    path: testInfo.outputPath("type-mobile-result.png"),
    fullPage: true,
  });
});
