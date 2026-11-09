import { expect, test } from "@playwright/test";
import { currentWord, gotoType, typeKana, waitForNextWord } from "./helpers";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

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

test("mobile typing exposes a touchable input that accepts input without programmatic focus", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });

  const input = page.locator(".ty-hidden-input");
  await expect(input).toBeVisible();
  await expect(input).toHaveAttribute("placeholder", "点这里，开始输入读音");

  const box = await input.boundingBox();
  expect(box?.width).toBeGreaterThan(200);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await expect(input).toHaveCSS("pointer-events", "auto");
  await expect(input).toHaveCSS("font-size", "16px");

  await input.tap();
  await expect(input).toBeFocused();

  // Deliberately skip focusTyping here: typing must work after the user's
  // direct touch gesture, matching the path a soft keyboard activates.
  const first = await currentWord(page);
  await page.keyboard.insertText(first.reading);
  await waitForNextWord(page, first.word);

  // Saving a word must not disable the field or drop the mobile keyboard
  // between words in the same group.
  await expect(input).toBeFocused();
  await page.keyboard.insertText((await currentWord(page)).reading);
  await page.locator(".ty-result").waitFor();
});
