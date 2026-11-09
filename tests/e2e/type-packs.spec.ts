import { expect, test } from "@playwright/test";
import {
  currentWord,
  focusTyping,
  gotoType,
  openPackPanel,
  selectPack,
  typeKana,
  waitForNextWord,
} from "./helpers";

test("switching packs keeps an independent unfinished group for each pack", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 3 });

  const n1First = await currentWord(page);
  await typeKana(page, n1First.reading);
  await waitForNextWord(page, n1First.word);
  const n1Next = await currentWord(page);

  await selectPack(page, "N2 高频词");
  await expect(page.locator(".ty-word")).toBeVisible();
  const n2First = await currentWord(page);
  await typeKana(page, n2First.reading);
  await waitForNextWord(page, n2First.word);
  const n2Next = await currentWord(page);

  await selectPack(page, "N1 高频词");
  await expect(page.getByText("2 / 3", { exact: false }).first()).toBeVisible();
  await expect(page.locator(".ty-word")).toHaveText(n1Next.word);

  await selectPack(page, "N2 高频词");
  await expect(page.getByText("2 / 3", { exact: false }).first()).toBeVisible();
  await expect(page.locator(".ty-word")).toHaveText(n2Next.word);

  await openPackPanel(page);
  await expect(
    page.locator("#ty-pack-panel").getByRole("button", { name: /N1 高频词/ }),
  ).not.toHaveClass(/is-active/);
  await expect(
    page.locator("#ty-pack-panel").getByRole("button", { name: /N2 高频词/ }),
  ).toHaveClass(/is-active/);
});

test("pack panel exposes the fixed My Words entry without widening active chips", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });
  await openPackPanel(page);

  const panel = page.locator("#ty-pack-panel");
  const chips = panel.locator(".ty-chip");
  await expect(chips).toHaveCount(4);
  await expect(chips.nth(0)).toHaveText("我的词");
  await expect(chips.nth(1)).toHaveText(/N2 高频词/);
  await expect(chips.nth(2)).toHaveText(/N1 高频词/);
  await expect(chips.nth(3)).toHaveText(/导入词包/);
  await expect(panel.locator(".ty-chip-dot")).toHaveCount(0);

  const activeWidth = await chips.nth(2).evaluate((element) =>
    element.getBoundingClientRect().width,
  );
  expect(activeWidth).toBeGreaterThan(94);
  expect(activeWidth).toBeLessThan(100);
  await expect(panel).toHaveCSS("animation-duration", "1e-05s");

  await panel.getByRole("button", { name: "我的词" }).click();
  await expect(page.locator("#ty-import-panel")).toBeVisible();
});

test("a custom batch size applies to the next group, then is restored", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 4 });
  await expect(page.getByText("1 / 4", { exact: false }).first()).toBeVisible();

  await page.goto("/#/settings");
  await expect(page.getByRole("spinbutton", { name: "每组词数" })).toHaveValue(
    "4",
  );
  await page.getByRole("spinbutton", { name: "每组词数" }).fill("2");
  await page.getByRole("spinbutton", { name: "每组词数" }).press("Enter");
  await expect(
    page.getByText("每组词数只在开始新组时生效", { exact: false }),
  ).toBeVisible();
  await page.goto("/#/type");
  await expect(page.getByText("1 / 4", { exact: false }).first()).toBeVisible();
});

test("an empty custom pack reports zero groups", async ({ page }) => {
  await page.goto("/#/library");
  await page.getByRole("button", { name: "新建词包" }).first().click();
  await page.getByLabel("词包名称").fill("空组数测试");
  await page.getByRole("button", { name: "创建词包", exact: true }).click();
  await expect(page.getByText("这个词包还是空的")).toBeVisible();

  await page.goto("/#/type");
  await openPackPanel(page);
  await expect(
    page
      .locator("#ty-pack-panel")
      .getByText("0 个词 · 0 组 · 打完 0 组", { exact: false }),
  ).toBeVisible();
  await expect(
    page.locator("#ty-pack-panel").locator(".ty-group-grid"),
  ).toHaveCount(0);
  await expect(
    page.locator("#ty-pack-panel").locator(".ty-group-cell"),
  ).toHaveCount(0);
  await expect(
    page
      .locator("#ty-pack-panel")
      .getByText("这个词包还没有带汉字和读音的词。"),
  ).toBeVisible();
});
