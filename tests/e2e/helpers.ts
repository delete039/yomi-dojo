import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";

interface SeedPack {
  words: Array<[string, string, string, number, string]>;
}

function readSeed(filename: string): SeedPack {
  return JSON.parse(
    fs.readFileSync(path.resolve("public", "data", filename), "utf8"),
  ) as SeedPack;
}

const builtinRows = [
  ...readSeed("builtin-n1.json").words,
  ...readSeed("builtin-n2.json").words,
];

export function readingFor(word: string): string {
  const row = builtinRows.find(([surface]) => surface === word);
  if (!row) throw new Error(`未在内置词包中找到「${word}」。`);
  return row[1];
}

/** Keep E2E on the same fast path as a reduced-motion user. */
export async function preparePage(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: "reduce" });
}

export async function setBatchSize(page: Page, size: number): Promise<void> {
  await page.goto("/#/settings");
  const input = page.getByRole("spinbutton", { name: "每组词数" });
  await input.fill(String(size));
  await input.press("Enter");
  await page.waitForTimeout(80);
}

export async function gotoType(
  page: Page,
  options?: { batchSize?: number },
): Promise<void> {
  await preparePage(page);
  if (options?.batchSize) await setBatchSize(page, options.batchSize);
  await page.goto("/#/type");
  await page.waitForSelector(".ty-practice .ty-word, .ty-result, .ty-empty-state");
  await page.waitForTimeout(30);
  await focusTyping(page);
}

export async function focusTyping(page: Page): Promise<void> {
  const input = page.locator(".ty-hidden-input");
  if (!(await input.count())) return;
  await expect(input).toBeVisible();
  await expect(input).toBeEnabled();
  await input.focus();
  await expect(input).toBeFocused();
}

export async function currentWord(page: Page): Promise<{
  word: string;
  reading: string;
}> {
  const word = (await page.locator(".ty-word").innerText()).trim();
  const concealed = await page.locator(".ty-reading-char.is-concealed").count();
  const visibleReading = (await page.locator(".ty-reading-char").allTextContents())
    .join("")
    .replaceAll("・", "")
    .trim();
  let fallback = "";
  try {
    fallback = readingFor(word);
  } catch {
    // Custom-pack words may have their reading concealed. Callers that type
    // custom words can provide the known reading from their fixture.
  }
  const completeReading =
    concealed === 0 && visibleReading
      ? visibleReading
      : fallback || visibleReading;
  return { word, reading: completeReading };
}

export async function typeKana(page: Page, reading: string): Promise<void> {
  await focusTyping(page);
  const before = await page.evaluate(() => ({
    word: document.querySelector(".ty-word")?.textContent?.trim() ?? "",
    typed: document.querySelectorAll(".ty-reading-char.is-typed").length,
    session: document
      .querySelector(".ty-practice")
      ?.getAttribute("data-session-id"),
  }));
  await page.keyboard.insertText(reading);
  // insertText bypasses keydown, so the React onInput path is the only thing
  // that can consume it. Wait for an observable state change instead of
  // letting a lost event surface as a 45-second timeout in the next step.
  await page.waitForFunction(
    ({ word, typed }) => {
      if (document.querySelector(".ty-result")) return true;
      const currentWord = document.querySelector(".ty-word")?.textContent?.trim();
      if (currentWord && currentWord !== word) return true;
      return document.querySelectorAll(".ty-reading-char.is-typed").length > typed;
    },
    { word: before.word, typed: before.typed },
    { timeout: 5_000 },
  );
}

export async function typeRomaji(page: Page, romaji: string): Promise<void> {
  await focusTyping(page);
  await page.keyboard.type(romaji, { delay: 5 });
}

export async function waitForNextWord(
  page: Page,
  previousWord: string,
): Promise<void> {
  await page.waitForFunction(
    (previous) => {
      if (document.querySelector(".ty-result")) return true;
      const word = document.querySelector(".ty-word")?.textContent?.trim();
      return Boolean(word && word !== previous);
    },
    previousWord,
  );
}

export async function completeCurrentWord(page: Page): Promise<string> {
  const { word, reading } = await currentWord(page);
  await typeKana(page, reading);
  await waitForNextWord(page, word);
  return word;
}

export async function openPackPanel(page: Page): Promise<void> {
  const trigger = page.locator(".ty-pack-trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await page.locator("#ty-pack-panel").waitFor({ state: "visible" });
}

export async function selectPack(page: Page, name: string): Promise<void> {
  const before = await page
    .locator(".ty-practice")
    .getAttribute("data-session-id")
    .catch(() => null);
  await openPackPanel(page);
  await page
    .locator("#ty-pack-panel")
    .getByRole("button", { name: new RegExp(name) })
    .click();
  await page.waitForFunction(
    (previous) => {
      if (document.querySelector(".ty-result")) return true;
      const practice = document.querySelector(".ty-practice");
      if (!practice?.querySelector(".ty-word")) return false;
      return practice.getAttribute("data-session-id") !== previous;
    },
    before,
  );
  await focusTyping(page);
}

export async function importPack(
  page: Page,
  name: string,
  text: string,
): Promise<void> {
  const firstWord = text
    .split(/\r?\n/)[0]
    .trim()
    .split(/[\t,]/)[0]
    .trim();
  const previousSession = await page
    .locator(".ty-practice")
    .getAttribute("data-session-id")
    .catch(() => null);
  await openPackPanel(page);
  await page.getByRole("button", { name: /导入词包/ }).click();
  await page.getByLabel("词包名字").fill(name);
  await page.getByLabel("待导入词汇").fill(text);
  await page.getByRole("button", { name: "下一步" }).click();
  await page.getByRole("button", { name: /^保存$/ }).click();
  await page.waitForFunction(
    ({ word, previous }) => {
      const practice = document.querySelector(".ty-practice");
      const currentWord = practice
        ?.querySelector(".ty-word")
        ?.textContent?.trim();
      if (!practice || currentWord !== word) return false;
      const session = practice.getAttribute("data-session-id");
      return Boolean(session && session !== previous);
    },
    { word: firstWord, previous: previousSession },
  );
  await focusTyping(page);
}
