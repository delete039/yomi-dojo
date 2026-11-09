import path from "node:path";
import { expect, test } from "@playwright/test";

async function chooseImportTarget(page: import("@playwright/test").Page) {
  await page.goto("/#/library");
  await page.getByRole("button", { name: "新建词包" }).first().click();
  await page.getByLabel("词包名称").fill("格式导入测试");
  await page.getByRole("button", { name: "创建词包", exact: true }).click();
  await expect(page.getByText("已创建词包「格式导入测试」。")).toBeVisible();
  await page.getByRole("button", { name: "导入词表" }).first().click();
}

async function importFile(
  page: import("@playwright/test").Page,
  file: string,
  expectedCount: number,
) {
  const dialog = page.getByRole("dialog");
  await page
    .locator('.dropzone input[type="file"]')
    .setInputFiles(path.resolve("tests", "fixtures", file));
  await page.getByRole("button", { name: "解析预览" }).click();
  await expect(
    dialog.getByRole("heading", { name: "校对导入词条" }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: `导入 ${expectedCount} 个词条`, exact: true })
    .click();
}

test("imports xlsx, JSON and TSV files into a new pack", async ({ page }) => {
  await chooseImportTarget(page);
  await importFile(page, "import-sample.xlsx", 2);
  await expect(
    page.getByText("已向「格式导入测试」导入 2 个词条。").last(),
  ).toBeVisible();

  await page.getByRole("button", { name: "导入词表" }).first().click();
  const json = JSON.stringify({
    words: [
      { word: "穏やか", reading: "おだやか", meaning: "平静，温和" },
      { word: "届ける", reading: "とどける", meaning: "送达" },
    ],
  });
  await page.locator('.dropzone input[type="file"]').setInputFiles({
    name: "words.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await page.getByRole("button", { name: "解析预览" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "导入 2 个词条", exact: true })
    .click();
  await expect(
    page.getByText("已向「格式导入测试」导入 2 个词条。").last(),
  ).toBeVisible();

  await page.getByRole("button", { name: "导入词表" }).first().click();
  const tsv = "单词\t读音\t释义\n静か\tしずか\t安静\n急ぐ\tいそぐ\t赶快";
  await page.locator('.dropzone input[type="file"]').setInputFiles({
    name: "words.tsv",
    mimeType: "text/tab-separated-values",
    buffer: Buffer.from(tsv),
  });
  await page.getByRole("button", { name: "解析预览" }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "导入 2 个词条", exact: true })
    .click();
  await expect(
    page.getByText("已向「格式导入测试」导入 2 个词条。").last(),
  ).toBeVisible();

  await expect(page.getByText("共 6 个词条")).toBeVisible();
  for (const word of ["灯", "祭り", "穏やか", "届ける", "静か", "急ぐ"]) {
    await expect(page.locator(".word-table-row").filter({ hasText: word })).toBeVisible();
  }
});
