import { expect, test } from "@playwright/test";
import {
  currentWord,
  gotoType,
  openPackPanel,
  typeKana,
  waitForNextWord,
} from "./helpers";

async function expectImportSummary(
  page: import("@playwright/test").Page,
  text: string,
) {
  await expect(page.locator(".ty-import-summary")).toContainText(text, {
    timeout: 20_000,
  });
}

test("inline import creates a selected pack and starts a real typing queue", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });
  await openPackPanel(page);
  await page.getByRole("button", { name: /导入词包/ }).click();

  const panelHeight = await page
    .locator("#ty-import-panel")
    .evaluate((element) => element.offsetHeight);
  expect(panelHeight).toBeGreaterThan(311);
  expect(panelHeight).toBeLessThanOrEqual(315);
  await expect(page.locator("#ty-import-panel")).toHaveCSS(
    "animation-duration",
    "1e-05s",
  );

  await page.getByLabel("词包名字").fill("内联导入测试");
  await page
    .getByLabel("待导入词汇")
    .fill("仮名\tかな\t假名\n漢字\tかんじ\t汉字");
  await page.getByRole("button", { name: "下一步" }).click();

  await expectImportSummary(page, "2 个词");
  await page.getByRole("button", { name: /^保存$/ }).click();

  await page.waitForFunction(() =>
    ["仮名", "漢字"].includes(
      document.querySelector(".ty-word")?.textContent?.trim() ?? "",
    ),
  );
  const first = await currentWord(page);
  expect(["仮名", "漢字"]).toContain(first.word);
  const readings: Record<string, string> = { 仮名: "かな", 漢字: "かんじ" };

  if (first.word === "仮名") {
    await page.locator(".ty-hidden-input").focus();
    await page.keyboard.type("k");
    await expect(page.locator(".ty-pending")).toHaveText("k");
    await expect(page.locator(".ty-reading-char.is-error")).toHaveCount(0);
    await page.keyboard.press("Backspace");
  }

  await typeKana(page, readings[first.word]);
  await waitForNextWord(page, first.word);
  const second = await currentWord(page);
  await typeKana(page, readings[second.word]);
  await page.locator(".ty-result").waitFor();

  await openPackPanel(page);
  await expect(
    page
      .locator("#ty-pack-panel")
      .getByRole("button", { name: /内联导入测试/ }),
  ).toHaveClass(/is-active/);
});

test("inline import reports duplicate rows and saves the previewed count", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });
  await openPackPanel(page);
  await page.getByRole("button", { name: /导入词包/ }).click();

  await page.getByLabel("词包名字").fill("重复行预览测试");
  await page
    .getByLabel("待导入词汇")
    .fill(
      "侮る\tあなどる\t轻视\n荷\tに\t负担\n拍子\tひょうし\t节拍\n侮る\tあなどる\t轻视",
    );
  await page.getByRole("button", { name: "下一步" }).click();

  await expectImportSummary(page, "3 个词");
  await expect(page.getByText("1 行重复，已合并")).toBeVisible();
  await page.getByRole("button", { name: /^保存$/ }).click();
  await page.waitForFunction(
    () => document.querySelector(".ty-word")?.textContent?.trim() === "侮る",
  );

  await openPackPanel(page);
  await expect(
    page.locator("#ty-pack-panel").getByText("3 个词 · 2 组", { exact: false }),
  ).toBeVisible();
});

test("missing-reading summary stays accurate after fixing only one row", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });
  await openPackPanel(page);
  await page.getByRole("button", { name: /导入词包/ }).click();

  await page.getByLabel("词包名字").fill("缺读音计数测试");
  await page.getByLabel("待导入词汇").fill("龘\n齉");
  await page.getByRole("button", { name: "下一步" }).click();

  await expectImportSummary(page, "2 行还缺读音");
  await expect(page.locator(".ty-import-row.has-error")).toHaveCount(2);

  await page.getByLabel("第 1 行读音").fill("たつ");
  await expectImportSummary(page, "1 行还缺读音");
  await expect(page.locator(".ty-import-row.has-error")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /^保存$/ })).toBeDisabled();

  await page.getByLabel("第 2 行读音").fill("かむ");
  await expect(page.locator(".ty-import-summary")).not.toContainText(
    "行还缺读音",
  );
  await expect(page.locator(".ty-import-row.has-error")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^保存$/ })).toBeEnabled();

  await page.getByRole("button", { name: /^保存$/ }).click();
  await page.waitForFunction(() =>
    ["龘", "齉"].includes(
      document.querySelector(".ty-word")?.textContent?.trim() ?? "",
    ),
  );
  await openPackPanel(page);
  await expect(
    page.locator("#ty-pack-panel").getByText("2 个词 · 1 组", { exact: false }),
  ).toBeVisible();

  const storedWords = await page.evaluate(async () => {
    type StoredPack = { name: string; words: Array<{ word: string }> };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yomidojo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const packs = await new Promise<StoredPack[]>((resolve, reject) => {
      const request = db
        .transaction("packs", "readonly")
        .objectStore("packs")
        .getAll();
      request.onsuccess = () => resolve(request.result as StoredPack[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return (
      packs.find((pack) => pack.name === "缺读音计数测试")?.words.map(
        (word) => word.word,
      ) ?? []
    );
  });
  expect(storedWords).toEqual(["龘", "齉"]);
});

test("invalid kana is identified inline and keeps save blocked", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });
  await openPackPanel(page);
  await page.getByRole("button", { name: /导入词包/ }).click();

  await page.getByLabel("词包名字").fill("无效读音测试");
  await page.getByLabel("待导入词汇").fill("侮る\tadomoru\t轻视");
  await page.getByRole("button", { name: "下一步" }).click();

  await expectImportSummary(page, "1 行读音无效");
  await expect(page.locator(".ty-import-row.has-error")).toHaveCount(1);
  await expect(page.getByText("读音必须是平假名或片假名。")).toBeVisible();
  await expect(page.getByLabel("第 1 行读音")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(page.getByRole("button", { name: /^保存$/ })).toBeDisabled();

  await page.getByLabel("第 1 行读音").fill("あなどる");
  await expect(page.locator(".ty-import-summary")).not.toContainText(
    "行读音无效",
  );
  await expect(page.locator(".ty-import-row.has-error")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^保存$/ })).toBeEnabled();
});

test("editing a row into a duplicate keeps save blocked", async ({ page }) => {
  await gotoType(page, { batchSize: 2 });
  await openPackPanel(page);
  await page.getByRole("button", { name: /导入词包/ }).click();

  await page.getByLabel("词包名字").fill("编辑后重复测试");
  await page
    .getByLabel("待导入词汇")
    .fill("侮る\tあなどる\t轻视\n侮る\tべつ\t另一读音");
  await page.getByRole("button", { name: "下一步" }).click();
  await expectImportSummary(page, "2 个词");

  await page.getByLabel("第 2 行读音").fill("あなどる");
  await expectImportSummary(page, "1 行编辑后重复");
  await expect(page.locator(".ty-import-row.has-error")).toHaveCount(1);
  await expect(page.getByText("词包或本次导入中已有同一词条。")).toBeVisible();
  await expect(page.getByRole("button", { name: /^保存$/ })).toBeDisabled();

  await page.getByLabel("第 2 行读音").fill("べつ");
  await expect(page.locator(".ty-import-summary")).not.toContainText(
    "编辑后重复",
  );
  await expect(page.locator(".ty-import-row.has-error")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^保存$/ })).toBeEnabled();
  await page.getByRole("button", { name: /^保存$/ }).click();
  await page.waitForFunction(() =>
    ["侮る"].includes(
      document.querySelector(".ty-word")?.textContent?.trim() ?? "",
    ),
  );
  await openPackPanel(page);
  await expect(
    page.locator("#ty-pack-panel").getByText("2 个词 · 1 组", { exact: false }),
  ).toBeVisible();
});
