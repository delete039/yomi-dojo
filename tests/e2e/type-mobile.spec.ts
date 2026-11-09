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

test("tapping the reading underlines opens the mobile input without a visible field", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });

  const input = page.locator(".ty-hidden-input");
  await expect(input).toBeVisible();
  expect(await input.getAttribute("placeholder")).toBeNull();

  const inputBox = await input.boundingBox();
  const underlineBox = await page
    .locator(".ty-reading-underline")
    .first()
    .boundingBox();
  expect(inputBox?.width).toBeGreaterThan(200);
  expect(inputBox?.height).toBeGreaterThanOrEqual(44);
  expect(underlineBox).not.toBeNull();
  expect(underlineBox!.x).toBeGreaterThanOrEqual(inputBox!.x);
  expect(underlineBox!.y).toBeGreaterThanOrEqual(inputBox!.y);
  expect(underlineBox!.x + underlineBox!.width).toBeLessThanOrEqual(
    inputBox!.x + inputBox!.width,
  );
  expect(underlineBox!.y + underlineBox!.height).toBeLessThanOrEqual(
    inputBox!.y + inputBox!.height,
  );
  await expect(input).toHaveCSS("pointer-events", "auto");
  await expect(input).toHaveCSS("font-size", "16px");
  await expect(input).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

  // Tap the visible underline itself. The transparent native input sits above
  // it, so this exercises the same direct gesture used to open a soft keyboard.
  await page.touchscreen.tap(
    underlineBox!.x + underlineBox!.width / 2,
    underlineBox!.y + underlineBox!.height / 2,
  );
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
