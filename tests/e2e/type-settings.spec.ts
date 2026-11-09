import { expect, test } from "@playwright/test";
import { currentWord, gotoType, typeKana } from "./helpers";

test("hint visibility setting and hold-space reveal are real", async ({ page }) => {
  await gotoType(page, { batchSize: 1 });
  const word = await currentWord(page);

  await expect(page.locator(".ty-reading-char").first()).toHaveText("・");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const hintRow = page.getByRole("radiogroup", { name: "读音" });
  await expect(hintRow.getByRole("radio", { name: "不显示" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.locator(".ty-hidden-input").focus();
  await page.keyboard.down("Space");
  await expect(page.locator(".ty-reading-char").first()).toHaveText(
    Array.from(word.reading)[0],
  );
  await page.keyboard.up("Space");
  await expect(page.locator(".ty-reading-char").first()).toHaveText("・");

  await page.getByRole("button", { name: "设置", exact: true }).click();
  await hintRow.getByRole("radio", { name: "显示读音" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.locator(".ty-reading-char").first()).not.toHaveText("・");
});

test("showing readings marks an error-free word as seen", async ({ page }) => {
  await gotoType(page, { batchSize: 1 });
  const word = await currentWord(page);

  await page.getByRole("button", { name: "设置", exact: true }).click();
  const hintRow = page.getByRole("radiogroup", { name: "读音" });
  await hintRow.getByRole("radio", { name: "显示读音" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(page.locator(".ty-reading-char").first()).not.toHaveText("・");

  await typeKana(page, word.reading);
  await page.locator(".ty-result").waitFor();
  await expect(page.getByText("打错或看了读音的 1 个")).toBeVisible();
  await expect(page.locator(".ty-weak-row strong")).toHaveText(word.word);
  await expect(page.locator(".ty-weak-tag")).toHaveText("看了");
});

test("keyboard layout starts on romaji and applies a saved kana choice", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  await page.getByRole("button", { name: "设置", exact: true }).click();
  const layout = page.getByRole("radiogroup", { name: "布局" });
  await expect(
    layout.getByRole("radio", { name: "罗马字" }),
  ).toHaveAttribute("aria-checked", "true");

  await layout.getByRole("radio", { name: "假名" }).click();
  await expect(layout.getByRole("radio", { name: "假名" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "内置键盘" }).click();
  await expect(page.locator('.ty-keyboard[data-mode="kana"]')).toBeVisible();
});

test("legacy settings migrate to hiding the reading once", async ({ page }) => {
  await gotoType(page, { batchSize: 1 });

  await page.evaluate(async () => {
    type Meta = { key: string; value: unknown };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yomidojo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const meta = await new Promise<Meta[]>((resolve, reject) => {
      const request = db
        .transaction("meta", "readonly")
        .objectStore("meta")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const settings = meta.find((entry) => entry.key === "settings");
    if (!settings) throw new Error("缺少设置记录");
    const transaction = db.transaction("meta", "readwrite");
    const store = transaction.objectStore("meta");
    store.put({
      key: "settings",
      value: { ...(settings.value as object), showReading: true },
    });
    store.delete("settingsRevision");
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });

  await page.reload();
  await page.waitForSelector(".ty-practice .ty-word");
  await expect(page.locator(".ty-reading-char").first()).toHaveText("・");
  await page.getByRole("button", { name: "设置", exact: true }).click();
  await expect(
    page
      .getByRole("radiogroup", { name: "读音" })
      .getByRole("radio", { name: "不显示" }),
  ).toHaveAttribute("aria-checked", "true");

  const migrated = await page.evaluate(async () => {
    type Meta = { key: string; value: unknown };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yomidojo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const meta = await new Promise<Meta[]>((resolve, reject) => {
      const request = db
        .transaction("meta", "readonly")
        .objectStore("meta")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const settings = meta.find((entry) => entry.key === "settings");
    const revision = meta.find((entry) => entry.key === "settingsRevision");
    return {
      showReading: (settings?.value as { showReading?: boolean } | undefined)
        ?.showReading,
      revision: revision?.value,
    };
  });
  expect(migrated).toEqual({ showReading: false, revision: 2 });
});

test("the out-of-scope sentence mode explains itself on touch", async ({ page }) => {
  await gotoType(page, { batchSize: 1 });
  // aria-disabled communicates the scope to assistive tech, but the control is
  // still a real touch target that explains why the mode is unavailable.
  await page.getByRole("radio", { name: "句子填空" }).click({ force: true });
  await expect(
    page.getByText("本版本只复刻「看汉字打读音」，句子填空暂未包含。"),
  ).toBeVisible();
  await expect(page.locator(".ty-word")).toBeVisible();
});

test("turning off auto-advance holds the completed word until Enter", async ({
  page,
}) => {
  await page.goto("/#/settings");
  const autoAdvance = page.getByRole("checkbox", {
    name: /答对后自动进入下一词/,
  });
  if (await autoAdvance.isChecked()) await autoAdvance.uncheck();

  await gotoType(page, { batchSize: 2 });
  const first = await currentWord(page);
  await typeKana(page, first.reading);

  await expect(page.getByRole("button", { name: "下一个词" })).toBeVisible();
  await expect(page.locator(".ty-word")).toHaveText(first.word);
  await expect(page.getByText("1 / 2", { exact: false }).first()).toBeVisible();

  await page.keyboard.press("Enter");
  await page.waitForFunction(
    (previous) =>
      document.querySelector(".ty-word")?.textContent?.trim() !== previous,
    first.word,
  );
  await expect(page.getByText("2 / 2", { exact: false }).first()).toBeVisible();

  await typeKana(page, (await currentWord(page)).reading);
  await page.locator(".ty-result").waitFor();
});
