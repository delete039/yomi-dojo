import { expect, test } from "@playwright/test";

test("create a pack, import a Japanese-header file, search the pack and dictionary", async ({
  page,
}) => {
  await page.goto("/#/library");
  await expect(page.getByRole("heading", { name: "词汇与词包" })).toBeVisible();

  await page.getByRole("button", { name: "新建词包" }).first().click();
  await page.getByLabel("词包名称").fill("E2E 词包");
  await page.getByRole("button", { name: "创建词包", exact: true }).click();
  await expect(page.getByText("已创建词包「E2E 词包」。")).toBeVisible();

  await page.getByRole("button", { name: "导入词表" }).first().click();
  await page.locator(".paste-area").fill(
    "単語,読み,意味\n勉強,べんきょう,学习\n約束,やくそく,约定",
  );
  await page.getByRole("button", { name: "解析预览" }).click();
  await expect(page.getByRole("heading", { name: "校对导入词条" })).toBeVisible();
  await expect(page.getByLabel("第 1 行单词")).toHaveValue("勉強");
  await expect(page.getByLabel("第 2 行读音")).toHaveValue("やくそく");
  await page.getByRole("button", { name: "导入 2 个词条" }).click();
  await expect(page.getByText("已向「E2E 词包」导入 2 个词条。")).toBeVisible();

  await page.locator(".pack-list-item").filter({ hasText: "E2E 词包" }).click();
  await expect(page.locator(".pack-detail-title h2")).toHaveText("E2E 词包");
  await expect(
    page.locator(".word-table-row").filter({ hasText: "勉強" }),
  ).toBeVisible();
  await expect(
    page.locator(".word-table-row").filter({ hasText: "約束" }),
  ).toBeVisible();

  await page.getByLabel("搜索词包").fill("勉強");
  await expect(page.getByText("筛选出 1 个词条")).toBeVisible();

  await page.locator(".library-tabs button").filter({ hasText: "查词词典" }).click();
  await page.getByLabel("搜索离线词典").fill("勉強");
  await expect(page.locator(".dictionary-result-row")).toHaveCount(2);
  await expect(
    page.locator(".dictionary-result-row").first(),
  ).toContainText("勉強");

  await page.getByLabel("搜索离线词典").fill("べんきょう");
  await expect(
    page.locator(".dictionary-result-row").first(),
  ).toContainText("勉強");

  await page.getByLabel("搜索离线词典").fill("学习");
  await expect(
    page.locator(".dictionary-result-row").filter({ hasText: "勉強" }).first(),
  ).toBeVisible();

  await page.getByLabel("搜索离线词典").fill("懐かしい");
  const result = page
    .locator(".dictionary-result-row")
    .filter({ hasText: "懐かしい" })
    .first();
  await expect(result).toBeVisible();
  await result.getByRole("button", { name: "加入", exact: true }).click();
  await expect(page.getByText("已将「懐かしい」加入「E2E 词包」。")).toBeVisible();

  await page.locator(".library-tabs button").filter({ hasText: "我的词包" }).click();
  await page.locator(".pack-list-item").filter({ hasText: "E2E 词包" }).click();
  await page.getByLabel("搜索词包").fill("懐かしい");
  await expect(page.getByText("筛选出 1 个词条")).toBeVisible();
});
