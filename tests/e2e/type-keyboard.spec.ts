import { expect, test, type Page } from "@playwright/test";
import { toRomaji } from "wanakana";
import { kanaKeyboardSteps } from "../../src/lib/kanaKeyboard";
import { currentWord, gotoType, waitForNextWord } from "./helpers";

async function pressKanaWord(page: Page, reading: string): Promise<void> {
  for (const kana of Array.from(reading)) {
    const steps = kanaKeyboardSteps(kana);
    for (const step of steps) {
      if (step.mark) {
        await page
          .locator(`.ty-keyboard [data-mark="${step.mark}"]`)
          .click();
      }
      await page.locator(`.ty-keyboard [data-key="${step.key}"]`).click();
    }
  }
}

async function pressRomajiWord(page: Page, romaji: string): Promise<void> {
  for (const key of Array.from(romaji)) {
    await page.locator(`.ty-keyboard [data-key="${key}"]`).click();
  }
}

test("the built-in kana keyboard completes words and replaces the native field", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });
  const first = await currentWord(page);

  await page.getByRole("button", { name: "内置键盘" }).click();
  await expect(page.locator(".ty-keyboard")).toBeVisible();
  await expect(page.locator(".ty-hidden-input")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "收起键盘" }),
  ).toHaveAttribute("aria-pressed", "true");

  await pressKanaWord(page, first.reading);
  await waitForNextWord(page, first.word);
  await expect(page.locator(".ty-keyboard")).toBeVisible();
  await expect(page.locator(".ty-hidden-input")).toBeDisabled();
  await expect(page.locator(".ty-reading-char.is-error")).toHaveCount(0);

  const second = await currentWord(page);
  await pressKanaWord(page, second.reading);
  await page.locator(".ty-result").waitFor();
  await expect(page.getByText("2 个全部一次打对")).toBeVisible();
});

test("the romaji layout feeds the same matcher and keeps its selected tab", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  const word = await currentWord(page);
  const romaji = toRomaji(word.reading);

  await page.getByRole("button", { name: "内置键盘" }).click();
  await page.locator('.ty-keyboard [data-mode="romaji"]').click();
  await expect(page.locator('.ty-keyboard [data-mode="romaji"]')).toHaveClass(
    /is-active/,
  );

  await pressRomajiWord(page, romaji);
  await page.locator(".ty-result").waitFor();
  await expect(page.getByText("1 个全部一次打对")).toBeVisible();
});

test("the keyboard stays above the mobile nav and closes back to the native field", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoType(page, { batchSize: 2 });
  await page.getByRole("button", { name: "内置键盘" }).click();
  await page.waitForTimeout(250);

  const panel = await page.locator(".ty-keyboard").boundingBox();
  const nav = await page.getByRole("navigation", { name: "移动端主导航" }).boundingBox();
  expect(panel).not.toBeNull();
  expect(nav).not.toBeNull();
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(nav!.y);
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);

  const actions = await page.locator(".ty-keyboard-actions").boundingBox();
  expect(actions).not.toBeNull();
  expect(actions!.y + actions!.height).toBeLessThanOrEqual(nav!.y);
  const key = await page.locator('.ty-keyboard [data-key="あ"]').boundingBox();
  expect(key).not.toBeNull();
  expect(key!.width).toBeGreaterThanOrEqual(30);
  expect(key!.height).toBeGreaterThanOrEqual(30);

  // Tapping the reading area must not summon the OS keyboard while the
  // in-page keyboard is active.
  await page.locator(".ty-reading-underline").first().click();
  await expect(page.locator(".ty-hidden-input")).toBeDisabled();
  await expect(page.locator(".ty-hidden-input")).not.toBeFocused();

  await page.getByRole("button", { name: "收起键盘" }).click();
  await expect(page.locator(".ty-keyboard")).toHaveCount(0);
  await expect(page.locator(".ty-hidden-input")).toBeEnabled();
  await expect(page.locator(".ty-hidden-input")).toBeFocused();

  // The preference survives a reload, and the active session resumes with
  // the in-page keyboard already open.
  await page.getByRole("button", { name: "内置键盘" }).click();
  await expect(page.locator(".ty-keyboard")).toBeVisible();
  // The optimistic UI opens immediately; allow the IndexedDB settings write
  // queued by the toggle to land before reloading the page.
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector(".ty-practice .ty-word, .ty-result");
  await expect(page.locator(".ty-keyboard")).toBeVisible();
  await expect(page.locator(".ty-hidden-input")).toBeDisabled();
});
