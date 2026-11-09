import { expect, test } from "@playwright/test";
import {
  currentWord,
  focusTyping,
  gotoType,
  typeKana,
  waitForNextWord,
} from "./helpers";

test("types a batch, shows errors, hint hold and the three-error skip", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });

  const first = await currentWord(page);
  await expect(page.getByText("1 / 2", { exact: false }).first()).toBeVisible();

  await focusTyping(page);
  await page.keyboard.press("q");
  await expect(page.locator(".ty-reading-char.is-error")).toHaveCount(1);
  await expect(page.locator(".ty-word")).toHaveText(first.word);

  await page.keyboard.press("q");
  await page.keyboard.press("q");
  await expect(page.getByRole("button", { name: "跳过" })).toBeVisible();
  await page.getByRole("button", { name: "跳过" }).click();
  await waitForNextWord(page, first.word);
  await expect(page.locator(".ty-hidden-input")).toBeFocused();

  const second = await currentWord(page);
  await page.keyboard.down("Space");
  await expect(page.locator(".ty-hint-button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.up("Space");
  await expect(page.locator(".ty-hint-button").first()).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  await typeKana(page, second.reading);
  await page.locator(".ty-result").waitFor();

  await expect(page.locator(".ty-result-metrics article")).toHaveCount(4);
  await expect(page.getByText("打错或看了读音的 2 个")).toBeVisible();
  await expect(page.locator(".ty-weak-row")).toHaveCount(2);
  await expect(page.locator(".ty-weak-tag").first()).toHaveText("跳过");
  await expect(page.getByRole("button", { name: "下一组" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "第 1 组再打一遍" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "只练这 2 个" })).toBeVisible();
});

test("an untouched first try shows 100 percent and no weak words", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  const word = await currentWord(page);
  await typeKana(page, word.reading);
  await page.locator(".ty-result").waitFor();

  await expect(
    page.locator(".ty-result-metrics article").nth(2).locator("strong"),
  ).toHaveText("100%");
  await expect(page.getByText("1 个全部一次打对")).toBeVisible();
  await expect(page.locator(".ty-weak-row")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "下一组" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "第 1 组再打一遍" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /只练这/ })).toHaveCount(0);
});

test("result metrics count up under normal motion", async ({ page }) => {
  await gotoType(page, { batchSize: 1 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const word = await currentWord(page);
  await typeKana(page, word.reading);
  await page.locator(".ty-result").waitFor();

  const samples = await page.evaluate(async () => {
    const output: string[][] = [];
    for (let index = 0; index < 10; index += 1) {
      output.push(
        [...document.querySelectorAll(".ty-result-metrics strong")].map(
          (element) => element.textContent?.trim() ?? "",
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 80));
    }
    return output;
  });

  expect(new Set(samples.map((row) => row[2])).size).toBeGreaterThan(1);
  await expect(
    page.locator(".ty-result-metrics article").nth(2).locator("strong"),
  ).toHaveText("100%");
});

test("romaji input, pending state and backspace keep the word alive", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });

  await focusTyping(page);
  await page.keyboard.type("e");
  await page.keyboard.type("n");
  await page.keyboard.type("k");
  await expect(page.locator(".ty-pending")).toHaveText("k");
  await expect(page.locator(".ty-reading-char.is-error")).toHaveCount(0);

  await page.keyboard.press("Backspace");
  await expect(page.locator(".ty-pending")).toHaveCount(0);

  const word = await currentWord(page);
  await typeKana(page, word.reading.slice(2));
  await page.locator(".ty-result").waitFor();
});
