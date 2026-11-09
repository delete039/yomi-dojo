import { expect, test, type Page } from "@playwright/test";
import { toRomaji } from "wanakana";
import {
  kanaFlickSteps,
  type FlickDirection,
} from "../../src/lib/kanaKeyboard";
import { currentWord, gotoType, waitForNextWord } from "./helpers";

async function flickKey(
  page: Page,
  keyId: string,
  direction: FlickDirection,
): Promise<void> {
  const key = page.locator(`.ty-keyboard [data-flick="${keyId}"]`);
  if (direction === "center") {
    await key.click();
    await page.waitForTimeout(10);
    return;
  }

  const box = await key.boundingBox();
  if (!box) throw new Error(`找不到键盘按键 ${keyId}`);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const offset = Math.max(24, Math.min(box.width, box.height) * 0.42);
  const dx = direction === "left" ? -offset : direction === "right" ? offset : 0;
  const dy = direction === "up" ? -offset : direction === "down" ? offset : 0;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: 3 });
  await page.mouse.up();
  await page.waitForTimeout(10);
}

async function setKanaMark(page: Page, mark: string): Promise<void> {
  if (mark === "small") {
    const small = page.locator('.ty-keyboard [data-mark="small"]');
    if ((await small.getAttribute("aria-pressed")) !== "true") {
      await small.click();
    }
    return;
  }

  const desired = mark === "dakuten" ? "dakuten" : "handakuten";
  const voice = page.locator('.ty-keyboard [data-mark="voice"]');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    if ((await voice.getAttribute("data-voice")) === desired) return;
    await voice.click();
  }
  throw new Error(`无法切换到 ${mark}`);
}

async function pressKanaWord(page: Page, reading: string): Promise<void> {
  for (const kana of Array.from(reading)) {
    const steps = kanaFlickSteps(kana);
    if (steps.length === 0) throw new Error(`键盘不支持假名「${kana}」`);
    for (const step of steps) {
      if (step.mark) await setKanaMark(page, step.mark);
      if (step.direct) {
        await page.locator(`.ty-keyboard [data-key="${step.direct}"]`).click();
        await page.waitForTimeout(10);
      } else if (step.keyId) {
        await flickKey(page, step.keyId, step.direction);
      }
    }
  }
}

async function pressRomajiWord(page: Page, romaji: string): Promise<void> {
  for (const letter of Array.from(romaji)) {
    await page.locator(`.ty-keyboard [data-key="${letter}"]`).click();
    await page.waitForTimeout(10);
  }
}

test("the native-style kana keyboard completes words and replaces the native field", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });
  const first = await currentWord(page);

  await page.getByRole("button", { name: "内置键盘" }).click();
  await expect(page.locator(".ty-keyboard")).toBeVisible();
  await page.locator('.ty-keyboard [data-switch-to="kana"]').click();
  await expect(page.locator('.ty-keyboard[data-mode="kana"]')).toBeVisible();
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

test("the 26-key QWERTY romaji layout feeds the same matcher and keeps its mode", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  const word = await currentWord(page);
  const romaji = toRomaji(word.reading);

  await page.getByRole("button", { name: "内置键盘" }).click();
  await expect(page.locator('.ty-keyboard[data-mode="romaji"]')).toBeVisible();
  await expect(page.locator(".ty-qwerty-row")).toHaveCount(3);
  await expect(page.locator(".ty-qwerty .ty-letter-key")).toHaveCount(26);
  await expect(page.locator('.ty-keyboard [data-key="a"]')).toBeVisible();
  await expect(page.locator('.ty-keyboard [data-key="\'"]')).toBeVisible();
  await expect(page.locator('.ty-keyboard [data-key="-"]')).toBeVisible();

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
  await page.locator('.ty-keyboard [data-switch-to="kana"]').click();
  await page.waitForTimeout(250);

  const panel = await page.locator(".ty-keyboard").boundingBox();
  const nav = await page.getByRole("navigation", { name: "移动端主导航" }).boundingBox();
  expect(panel).not.toBeNull();
  expect(nav).not.toBeNull();
  expect(panel!.y + panel!.height).toBeLessThanOrEqual(nav!.y);
  expect(panel!.x).toBeGreaterThanOrEqual(0);
  expect(panel!.x + panel!.width).toBeLessThanOrEqual(390);

  const grid = await page.locator(".ty-ios-kana").boundingBox();
  expect(grid).not.toBeNull();
  expect(grid!.y + grid!.height).toBeLessThanOrEqual(nav!.y);
  const key = await page.locator('.ty-keyboard [data-flick="a"]').boundingBox();
  expect(key).not.toBeNull();
  expect(key!.width).toBeGreaterThanOrEqual(30);
  expect(key!.height).toBeGreaterThanOrEqual(30);

  // Tapping the reading area must not summon the OS keyboard while the
  // in-page keyboard is active.
  await page.locator(".ty-reading-underline").first().click();
  await expect(page.locator(".ty-hidden-input")).toBeDisabled();
  await expect(page.locator(".ty-hidden-input")).not.toBeFocused();

  await page.locator('.ty-keyboard [data-action="hide"]').click();
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

test("the built-in keyboard defaults to romaji and remembers the chosen layout", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  await page.getByRole("button", { name: "内置键盘" }).click();
  await expect(page.locator('.ty-keyboard[data-mode="romaji"]')).toBeVisible();

  await page.locator('.ty-keyboard [data-switch-to="kana"]').click();
  await expect(page.locator('.ty-keyboard[data-mode="kana"]')).toBeVisible();
  // The mode is saved through the same settings queue as the keyboard toggle.
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector(".ty-practice .ty-word, .ty-result");
  await expect(page.locator('.ty-keyboard[data-mode="kana"]')).toBeVisible();

  await page.locator('.ty-keyboard [data-switch-to="romaji"]').click();
  await expect(page.locator('.ty-keyboard[data-mode="romaji"]')).toBeVisible();
  await page.waitForTimeout(300);
  await page.reload();
  await page.waitForSelector(".ty-practice .ty-word, .ty-result");
  await expect(page.locator('.ty-keyboard[data-mode="romaji"]')).toBeVisible();
});
