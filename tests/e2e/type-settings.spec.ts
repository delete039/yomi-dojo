import { expect, test } from "@playwright/test";
import { currentWord, gotoType, typeKana } from "./helpers";

test("hint visibility setting and hold-space reveal are real", async ({ page }) => {
  await gotoType(page, { batchSize: 1 });
  const word = await currentWord(page);

  await page.getByRole("button", { name: "设置", exact: true }).click();
  const hintRow = page.getByRole("radiogroup", { name: "提示" });
  await hintRow.getByRole("radio", { name: "不显示" }).click();
  await page.getByRole("button", { name: "设置", exact: true }).click();

  await expect(page.locator(".ty-reading-char").first()).toHaveText("・");
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
