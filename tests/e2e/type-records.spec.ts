import { expect, test } from "@playwright/test";
import {
  currentWord,
  focusTyping,
  gotoType,
  typeKana,
} from "./helpers";

test("word error rate and mastery are written to the records view", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  const word = await currentWord(page);

  await focusTyping(page);
  await page.keyboard.press("q");
  await typeKana(page, word.reading);
  await page.locator(".ty-result").waitFor();

  await page.goto("/#/records");
  await expect(
    page.getByRole("heading", { name: "每一次卡住，都有迹可循。" }),
  ).toBeVisible();
  const row = page.locator(".records-word-row").filter({ hasText: word.word });
  await expect(row).toBeVisible();
  await expect(row).toContainText("100%");
  await expect(row).toContainText("1 次输入错误");
  await expect(row).toContainText("学习中");

  await row.click();
  const detail = page.getByRole("dialog");
  await expect(detail).toContainText(word.reading);
  await expect(detail).toContainText("1 次练习");
  await expect(detail).toContainText("有错误");
  await detail.getByRole("button", { name: "完成" }).click();
});
