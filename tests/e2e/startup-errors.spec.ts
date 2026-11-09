import { expect, test } from "@playwright/test";

test("a failed built-in seed shows a Chinese recovery message and can retry", async ({
  page,
}) => {
  const seed = "**/data/builtin-n1.json";
  await page.route(seed, (route) => route.abort("failed"));

  await page.goto("/#/type");
  await expect(
    page.getByRole("heading", { name: "无法打开本地学习数据" }),
  ).toBeVisible();
  await expect(
    page.getByText("内置词包资源加载失败，请检查网络后重试。"),
  ).toBeVisible();
  await expect(page.getByText("Failed to fetch")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "重新载入" })).toHaveCSS(
    "background-color",
    "rgb(214, 197, 156)",
  );

  await page.unroute(seed);
  await page.getByRole("button", { name: "重新载入" }).click();
  await page.waitForSelector(".ty-word, .ty-result, .ty-empty-state");
});
