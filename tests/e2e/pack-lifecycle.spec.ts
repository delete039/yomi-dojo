import { expect, test } from "@playwright/test";

test("creates an empty pack, adds and removes a manual word, then deletes the pack", async ({
  page,
}) => {
  await page.goto("/#/library");
  await page.getByRole("button", { name: "新建词包" }).first().click();
  await page.getByLabel("词包名称").fill("生命周期测试");
  await page.getByLabel("说明").fill("用于验证空词包、手动词条与删除流程");
  await page.getByRole("button", { name: "创建词包", exact: true }).click();
  await expect(page.getByText("已创建词包「生命周期测试」。")).toBeVisible();
  await expect(page.getByText("这个词包还是空的")).toBeVisible();

  await page.getByRole("button", { name: "添加词汇" }).first().click();
  await page.getByRole("tab", { name: "手动创建" }).click();
  await page.getByLabel("单词", { exact: true }).fill("木漏れ日");
  await page.getByLabel("读音", { exact: true }).fill("こもれび");
  await page.getByLabel("中文释义").fill("从树叶缝隙洒下的阳光");
  await page.getByRole("button", { name: "加入词包", exact: true }).click();
  await expect(page.getByText("已将「木漏れ日」加入「生命周期测试」。")).toBeVisible();
  await expect(
    page.locator(".word-table-row").filter({ hasText: "木漏れ日" }),
  ).toBeVisible();

  await page.locator(".word-table-row").filter({ hasText: "木漏れ日" }).click();
  const detail = page.getByRole("dialog");
  await detail.getByRole("button", { name: "从词包移除" }).click();
  await detail.getByRole("button", { name: "再次点击确认" }).click();
  await expect(page.getByText("词条已从词包移除。")).toBeVisible();
  await expect(page.getByText("这个词包还是空的")).toBeVisible();

  await page.getByRole("button", { name: "删除词包" }).click();
  const confirm = page.getByRole("dialog");
  await expect(confirm.getByRole("heading", { name: "删除「生命周期测试」？" })).toBeVisible();
  await confirm.getByRole("button", { name: "删除词包", exact: true }).click();
  await expect(page.getByText("词包「生命周期测试」已删除，词汇掌握记录仍保留。")).toBeVisible();
  await expect(
    page.locator(".pack-list-item").filter({ hasText: "生命周期测试" }),
  ).toHaveCount(0);
});
