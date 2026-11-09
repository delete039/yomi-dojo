import { expect, test } from "@playwright/test";
import {
  currentWord,
  focusTyping,
  gotoType,
  importPack,
  typeKana,
  waitForNextWord,
} from "./helpers";

test("combo appears at five keys and survives hint and skip", async ({ page }) => {
  await gotoType(page, { batchSize: 2 });
  await importPack(
    page,
    "连击行为测试",
    "東京都\tとうきょうと\t东京都\n大阪府\tおおさかふ\t大阪府",
  );

  const first = await currentWord(page);
  expect(first.reading).toBe("とうきょうと");
  await focusTyping(page);
  await page.keyboard.press("q");
  await expect(page.locator(".ty-combo")).toHaveCount(0);

  for (const kana of Array.from("とうきょう")) {
    await page.keyboard.insertText(kana);
  }
  await expect(page.locator(".ty-combo")).toHaveText("连击 5");

  await page.keyboard.down("Space");
  await expect(page.locator(".ty-hint-button").first()).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".ty-combo")).toHaveText("连击 5");
  await page.keyboard.up("Space");

  await page.keyboard.press("Escape");
  await waitForNextWord(page, first.word);
  await expect(page.locator(".ty-combo")).toHaveText("连击 5");
  await expect(page.getByText("2 / 2", { exact: false }).first()).toBeVisible();
});

test("redo group replays every word in the original order", async ({ page }) => {
  await gotoType(page, { batchSize: 2 });
  await importPack(
    page,
    "重打本组测试",
    "円滑\tえんかつ\t顺利，顺畅\n肝心\tかんじん\t关键，要紧",
  );
  const first = await currentWord(page);
  await typeKana(page, first.reading);
  await waitForNextWord(page, first.word);
  const second = await currentWord(page);
  await typeKana(page, second.reading);
  await page.locator(".ty-result").waitFor();

  await expect(
    page.getByText("第一次打完第 1 组，用时就是纪录"),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "第 1 组再打一遍" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "第 1 组再打一遍" }).click();

  await expect(page.getByText("1 / 2", { exact: false }).first()).toBeVisible();
  await expect(page.locator(".ty-word")).toHaveText(first.word);
  await typeKana(page, first.reading);
  await waitForNextWord(page, first.word);
  await expect(page.getByText("2 / 2", { exact: false }).first()).toBeVisible();
  await expect(page.locator(".ty-word")).toHaveText(second.word);
  await typeKana(page, second.reading);
  await page.locator(".ty-result").waitFor();

  // A retry keeps the original group number instead of consuming a new one.
  await expect(page.locator(".ty-result-record")).toHaveText(
    /^第 1 组最快 \d+:\d{2}，(追平了|这次慢了 \d+ 秒)$/,
  );
  await expect(
    page.getByRole("button", { name: "第 1 组再打一遍" }),
  ).toBeVisible();
});
