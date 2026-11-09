import fs from "node:fs";
import { expect, test } from "@playwright/test";

test("export a complete backup and restore it over newer data", async ({
  page,
}, testInfo) => {
  await page.goto("/#/settings");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 JSON 备份" }).click();
  const download = await downloadPromise;
  const backupPath = testInfo.outputPath("backup.json");
  await download.saveAs(backupPath);

  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8")) as {
    format: string;
    version: number;
    packs: unknown[];
    plans: unknown[];
    wordStats: unknown[];
    sessions: unknown[];
    settings: { batchSize: number };
  };
  expect(backup.format).toBe("yomidojo-backup");
  expect(backup.version).toBe(1);
  expect(backup.packs).toHaveLength(2);
  expect(backup.plans).toHaveLength(2);
  expect(backup.wordStats).toHaveLength(0);
  expect(backup.settings.batchSize).toBe(20);

  await page.goto("/#/library");
  await page.getByRole("button", { name: "新建词包" }).first().click();
  await page.getByLabel("词包名称").fill("恢复后应消失的临时词包");
  await page.getByRole("button", { name: "创建词包", exact: true }).click();
  await expect(
    page.locator(".pack-list-item").filter({ hasText: "恢复后应消失的临时词包" }),
  ).toBeVisible();

  await page.goto("/#/settings");
  await page
    .locator('input[type="file"][accept*="json"]')
    .setInputFiles(backupPath);
  await expect(
    page.getByRole("heading", { name: "用备份替换当前数据？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认恢复" }).click();
  await expect(page.getByText("备份已恢复", { exact: false })).toBeVisible();

  await page.goto("/#/library");
  await expect(
    page.locator(".pack-list-item").filter({ hasText: "恢复后应消失的临时词包" }),
  ).toHaveCount(0);
  await expect(page.locator(".pack-list-item")).toHaveCount(2);
});
