import { expect, test } from "@playwright/test";
import { toRomaji } from "wanakana";
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

test("Android IME composition advances without pressing Enter", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });
  const first = await currentWord(page);
  const input = page.locator(".ty-hidden-input");
  const underline = page.locator(".ty-reading-underline").first();
  const box = await underline.boundingBox();
  if (!box) throw new Error("读音短横线不可见");
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(input).toBeFocused();

  await page.evaluate((reading) => {
    const field = document.querySelector(".ty-hidden-input");
    if (!(field instanceof HTMLInputElement)) throw new Error("缺少输入框");
    field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    let composing = "";
    for (const character of Array.from(reading)) {
      composing += character;
      field.value = composing;
      field.dispatchEvent(
        new CompositionEvent("compositionupdate", {
          bubbles: true,
          data: composing,
        }),
      );
      field.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: character,
          inputType: "insertCompositionText",
          isComposing: true,
        }),
      );
    }
  }, first.reading);

  // The word must complete while the composition is still open, i.e. before
  // the Android IME commits it with Enter.
  await waitForNextWord(page, first.word);
  await page.evaluate(() => {
    const field = document.querySelector(".ty-hidden-input");
    if (!(field instanceof HTMLInputElement)) throw new Error("缺少输入框");
    field.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: field.value,
      }),
    );
  });

  // Committing the previous composition must not replay its text into the
  // next word or add an error.
  await expect(page.locator(".ty-reading-char.is-error")).toHaveCount(0);
  const second = await currentWord(page);
  await typeKana(page, second.reading);
  await page.locator(".ty-result").waitFor();
  await expect(page.getByText("2 个全部一次打对")).toBeVisible();
});

test("Android romaji composition advances before IME commit", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  const first = await currentWord(page);
  const input = page.locator(".ty-hidden-input");
  await input.focus();
  const romaji = toRomaji(first.reading);

  await page.evaluate((keys) => {
    const field = document.querySelector(".ty-hidden-input");
    if (!(field instanceof HTMLInputElement)) throw new Error("缺少输入框");
    field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    let composing = "";
    for (const character of Array.from(keys)) {
      composing += character;
      field.value = composing;
      field.dispatchEvent(
        new CompositionEvent("compositionupdate", {
          bubbles: true,
          data: composing,
        }),
      );
      field.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          data: character,
          inputType: "insertCompositionText",
          isComposing: true,
        }),
      );
    }
  }, romaji);

  await page.locator(".ty-result").waitFor();
  await expect(page.getByText("1 个全部一次打对")).toBeVisible();
});

test("IME text exposed only on compositionend still commits", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  const first = await currentWord(page);
  const input = page.locator(".ty-hidden-input");
  await input.focus();

  await page.evaluate((reading) => {
    const field = document.querySelector(".ty-hidden-input");
    if (!(field instanceof HTMLInputElement)) throw new Error("缺少输入框");
    field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    field.value = reading;
    field.dispatchEvent(
      new CompositionEvent("compositionend", {
        bubbles: true,
        data: reading,
      }),
    );
  }, first.reading);

  await page.locator(".ty-result").waitFor();
  await expect(page.getByText("1 个全部一次打对")).toBeVisible();
});
