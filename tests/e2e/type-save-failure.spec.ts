import { expect, test } from "@playwright/test";
import { currentWord, gotoType, typeKana } from "./helpers";

async function disableAutoAdvance(page: import("@playwright/test").Page) {
  await page.goto("/#/settings");
  const autoAdvance = page.getByRole("checkbox", {
    name: /答对后自动进入下一词/,
  });
  if (await autoAdvance.isChecked()) await autoAdvance.uncheck();
}

test("a delayed save keeps the next-word control locked until the write lands", async ({
  page,
}) => {
  await disableAutoAdvance(page);
  await gotoType(page, { batchSize: 2 });

  await page.evaluate(() => {
    const prototype = IDBTransaction.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, "oncomplete");
    if (!descriptor?.set) throw new Error("IDBTransaction.oncomplete is unavailable");
    let armed = false;
    (window as unknown as { armDelayedSave: () => void }).armDelayedSave = () => {
      armed = true;
    };
    Object.defineProperty(prototype, "oncomplete", {
      configurable: true,
      get: descriptor.get,
      set(handler: ((this: IDBTransaction, event: Event) => void) | null) {
        const transaction = this;
        descriptor.set!.call(transaction, (event: Event) => {
          if (
            armed &&
            transaction.mode === "readwrite" &&
            transaction.objectStoreNames.contains("plans")
          ) {
            armed = false;
            window.setTimeout(() => handler?.call(transaction, event), 900);
            return;
          }
          handler?.call(transaction, event);
        });
      },
    });
  });
  await page.evaluate(() =>
    (window as unknown as { armDelayedSave: () => void }).armDelayedSave(),
  );

  const first = await currentWord(page);
  await typeKana(page, first.reading);

  const next = page.getByRole("button", { name: /保存中…|下一个词/ });
  await expect(next).toBeVisible();
  await expect(next).toBeDisabled();
  await expect(next).toHaveText("保存中…");
  await expect(page.locator(".ty-word")).toHaveText(first.word);

  await expect(next).toBeEnabled({ timeout: 5_000 });
  await expect(next).toHaveText("下一个词");
  await next.click();
  await expect(page.locator(".ty-word")).not.toHaveText(first.word);
  await expect(page.getByText("2 / 2", { exact: false }).first()).toBeVisible();
  const answerCount = await page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open("yomidojo");
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const transaction = database.transaction("plans", "readonly");
          const all = transaction.objectStore("plans").getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            const plan = (all.result as Array<{
              activeSession?: { answers?: unknown[] } | null;
            }>).find((entry) => entry.activeSession);
            resolve(plan?.activeSession?.answers?.length ?? -1);
          };
        };
      }),
  );
  expect(answerCount).toBe(1);
});

test("a failed write keeps the word and retry saves it exactly once", async ({
  page,
}) => {
  await disableAutoAdvance(page);
  await gotoType(page, { batchSize: 2 });

  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let failNext = false;
    let successfulPlanPuts = 0;
    (window as unknown as { failNextAnswerSave: () => void }).failNextAnswerSave =
      () => {
        failNext = true;
      };
    (
      window as unknown as { successfulAnswerPlanPuts: () => number }
    ).successfulAnswerPlanPuts = () => successfulPlanPuts;
    IDBObjectStore.prototype.put = function put(
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (failNext && this.name === "plans") {
        failNext = false;
        throw new DOMException("注入的保存失败", "AbortError");
      }
      if (this.name === "plans") successfulPlanPuts += 1;
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    };
  });
  await page.evaluate(() =>
    (window as unknown as { failNextAnswerSave: () => void }).failNextAnswerSave(),
  );

  const first = await currentWord(page);
  await typeKana(page, first.reading);

  await expect(page.getByRole("alert")).toContainText("注入的保存失败");
  await expect(page.locator(".ty-word")).toHaveText(first.word);
  await expect(page.locator(".ty-hidden-input")).toBeDisabled();
  const retry = page.getByRole("button", { name: "重试保存" });
  await expect(retry).toBeVisible();
  await retry.click();

  await expect(page.getByRole("alert")).toHaveCount(0);
  const next = page.getByRole("button", { name: "下一个词" });
  await expect(next).toBeEnabled({ timeout: 5_000 });
  await next.click();
  await expect(page.locator(".ty-word")).not.toHaveText(first.word);
  await expect(page.getByText("2 / 2", { exact: false }).first()).toBeVisible();

  const persistence = await page.evaluate(async () => {
    const successfulPlanPuts = (
      window as unknown as { successfulAnswerPlanPuts: () => number }
    ).successfulAnswerPlanPuts();
    const answerCount = await new Promise<number>((resolve, reject) => {
      const request = indexedDB.open("yomidojo");
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction("plans", "readonly");
        const all = transaction.objectStore("plans").getAll();
        all.onerror = () => reject(all.error);
        all.onsuccess = () => {
          const plan = (all.result as Array<{
            activeSession?: { answers?: unknown[] } | null;
          }>).find((entry) => entry.activeSession);
          resolve(plan?.activeSession?.answers?.length ?? -1);
        };
      };
    });
    return { successfulPlanPuts, answerCount };
  });
  expect(persistence).toEqual({ successfulPlanPuts: 1, answerCount: 1 });
});

test("a failed final answer creates exactly one summary after retry", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });

  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    let failNext = false;
    (window as unknown as { failNextAnswerSave: () => void }).failNextAnswerSave =
      () => {
        failNext = true;
      };
    IDBObjectStore.prototype.put = function put(
      this: IDBObjectStore,
      value: unknown,
      key?: IDBValidKey,
    ) {
      if (failNext && this.name === "plans") {
        failNext = false;
        throw new DOMException("注入的最后一词保存失败", "AbortError");
      }
      return key === undefined
        ? original.call(this, value)
        : original.call(this, value, key);
    };
  });
  await page.evaluate(() =>
    (window as unknown as { failNextAnswerSave: () => void }).failNextAnswerSave(),
  );

  const first = await currentWord(page);
  await typeKana(page, first.reading);
  await expect(page.getByRole("alert")).toContainText("注入的最后一词保存失败");
  await expect(page.locator(".ty-word")).toHaveText(first.word);

  await page.getByRole("button", { name: "重试保存" }).click();
  await expect(page.locator(".ty-result")).toBeVisible();
  await expect(page.locator(".ty-result")).toHaveCount(1);

  const sessions = await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yomidojo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = db
        .transaction("sessions", "readonly")
        .objectStore("sessions")
        .getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    return rows.length;
  });
  expect(sessions).toBe(1);
});
