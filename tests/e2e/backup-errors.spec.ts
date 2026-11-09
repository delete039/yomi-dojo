import { expect, test } from "@playwright/test";

test("rejects malformed JSON backups without replacing current data", async ({
  page,
}) => {
  await page.goto("/#/settings");
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: "broken-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from("{ this is not json"),
  });
  await expect(
    page.getByRole("heading", { name: "用备份替换当前数据？" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认恢复" }).click();
  await expect(page.getByText("备份文件不是有效 JSON。")).toBeVisible();

  await page.reload();
  await page.locator('input[type="file"][accept*="json"]').setInputFiles({
    name: "unknown-format.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ format: "other-app", version: 1, packs: [] }),
    ),
  });
  await page.getByRole("button", { name: "确认恢复" }).click();
  await expect(
    page.getByText("不是受支持的読み道場备份文件。"),
  ).toBeVisible();

  await page.goto("/#/library");
  await expect(page.locator(".pack-list-item")).toHaveCount(2);
  await expect(
    page.locator(".pack-list-item").filter({ hasText: "N1 高频词" }),
  ).toBeVisible();
});
