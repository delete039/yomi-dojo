import { expect, test } from "@playwright/test";
import {
  completeCurrentWord,
  currentWord,
  focusTyping,
  gotoType,
  importPack,
  openPackPanel,
  typeKana,
} from "./helpers";

test("result labels hint use and errors, then drills the weak words", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });

  const first = await currentWord(page);
  await focusTyping(page);
  await page.keyboard.down("Space");
  await page.waitForTimeout(60);
  await page.keyboard.up("Space");
  await typeKana(page, first.reading);
  await page.waitForFunction(
    (previous) =>
      document.querySelector(".ty-word")?.textContent?.trim() !== previous,
    first.word,
  );

  const second = await currentWord(page);
  await focusTyping(page);
  await page.keyboard.press("q");
  await typeKana(page, second.reading);
  await page.locator(".ty-result").waitFor();

  await expect(page.getByText("打错或看了读音的 2 个")).toBeVisible();
  await expect(
    page.getByText("第一次打完第 1 组，用时就是纪录"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "下一组" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /第 1 组再打一遍/ }),
  ).toBeVisible();
  const labels = page.locator(".ty-weak-tag");
  await expect(labels).toHaveCount(2);
  await expect(labels.filter({ hasText: "看了" })).toHaveCount(1);
  await expect(labels.filter({ hasText: "错 1" })).toHaveCount(1);

  const weakWords = (
    await page.locator(".ty-weak-row strong").allTextContents()
  ).map((value) => value.trim());
  const expectedDrillOrder = [weakWords[1], weakWords[0]];
  await page.evaluate(() => {
    (window as Window & { __originalRandom?: () => number }).__originalRandom =
      Math.random;
    Math.random = () => 0;
  });
  await page.getByRole("button", { name: "只练这 2 个" }).click();
  await page.locator(".ty-practice .ty-word").waitFor();
  await page.evaluate(() => {
    Math.random =
      (window as Window & { __originalRandom?: () => number }).__originalRandom ??
      Math.random;
  });
  await expect(page.getByText("1 / 2", { exact: false }).first()).toBeVisible();
  const drillWord = (await page.locator(".ty-word").innerText()).trim();
  expect(drillWord).toBe(expectedDrillOrder[0]);

  const drillState = await page.evaluate(async () => {
    type StoredPlan = {
      activeSession: {
        kind: string;
        drillKeys?: string[];
        queue: Array<{ key: string }>;
        wordSnapshots?: Record<string, { word: string }>;
      } | null;
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yomidojo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const plans = await new Promise<StoredPlan[]>((resolve, reject) => {
      const request = db
        .transaction("plans", "readonly")
        .objectStore("plans")
        .getAll();
      request.onsuccess = () => resolve(request.result as StoredPlan[]);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const session = plans.find(
      (plan) => plan.activeSession?.kind === "drill",
    )?.activeSession;
    const queueKeys = session?.queue.map((item) => item.key) ?? [];
    return {
      drillKeys: session?.drillKeys ?? [],
      queueKeys,
      queueWords: queueKeys.map(
        (key) => session?.wordSnapshots?.[key]?.word ?? "",
      ),
    };
  });
  expect(drillState.queueWords).toEqual(expectedDrillOrder);
  expect(drillState.drillKeys).toEqual(drillState.queueKeys);

  await typeKana(page, (await currentWord(page)).reading);
  await expect(page.getByText("2 / 2", { exact: false }).first()).toBeVisible();
  await completeCurrentWord(page);
  await expect(page.locator(".ty-result")).toBeVisible();
  await expect(page.locator(".ty-result-record")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /第 \d+ 组再打一遍/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "再来一组" })).toBeVisible();

  await page.getByRole("button", { name: "再来一组" }).click();
  await expect(page.getByText("1 / 2", { exact: false }).first()).toBeVisible();
  await completeCurrentWord(page);
  await completeCurrentWord(page);
  await expect(page.locator(".ty-result")).toBeVisible();
  await expect(page.locator(".ty-result-record")).toHaveCount(0);
  await expect(
    page.getByText(/第一次打完第|第 \d+ 组最快/),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /第 \d+ 组再打一遍/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "再来一组" })).toBeVisible();
});

test("refreshing the completion state reopens the same result", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  const word = await currentWord(page);
  await typeKana(page, word.reading);
  await page.locator(".ty-result").waitFor();

  await page.reload();
  await page.locator(".ty-result").waitFor();
  await expect(page.getByText("1 个全部一次打对")).toBeVisible();
  await expect(page.getByRole("button", { name: "下一组" })).toBeVisible();
});

test("a saved result and its redo survive removing the word from the pack", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });
  await importPack(
    page,
    "结果快照测试",
    "円滑\tえんかつ\t顺利，顺畅\n肝心\tかんじん\t关键，要紧",
  );

  const first = await currentWord(page);
  await focusTyping(page);
  await page.keyboard.down("Space");
  await page.waitForTimeout(60);
  await page.keyboard.up("Space");
  await typeKana(page, first.reading);
  await page.waitForFunction(
    (previous) =>
      document.querySelector(".ty-word")?.textContent?.trim() !== previous,
    first.word,
  );

  await typeKana(page, (await currentWord(page)).reading);
  await page.locator(".ty-result").waitFor();
  await expect(page.locator(".ty-weak-row strong")).toHaveText(first.word);

  await page.evaluate(async (word) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yomidojo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const packs = await new Promise<Array<{
      id: string;
      name: string;
      words: Array<{ word: string }>;
    }>>((resolve, reject) => {
      const request = db
        .transaction("packs", "readonly")
        .objectStore("packs")
        .getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const pack = packs.find((entry) => entry.name === "结果快照测试");
    if (!pack) throw new Error("测试词包不存在。");
    const updated = {
      ...pack,
      words: pack.words.filter((entry) => entry.word !== word),
    };
    await new Promise<void>((resolve, reject) => {
      const request = db
        .transaction("packs", "readwrite")
        .objectStore("packs")
        .put(updated);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();
  }, first.word);

  await page.reload();
  await page.locator(".ty-result").waitFor();
  await expect(page.getByText("打错或看了读音的 1 个")).toBeVisible();
  await expect(page.locator(".ty-weak-row strong")).toHaveText(first.word);
  await expect(page.locator(".ty-weak-row.is-missing")).toHaveCount(1);
  await expect(page.locator(".ty-weak-meaning")).toContainText("词条已移除");
  await page.getByRole("button", { name: "第 1 组再打一遍" }).click();
  await expect(page.locator(".ty-word")).toHaveText(first.word);
  await expect(page.getByText("1 / 2", { exact: false }).first()).toBeVisible();
});

test("legacy results without snapshots disable an impossible redo", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  await importPack(
    page,
    "旧结算无快照测试",
    "龘\tたつ\t测试用字",
  );

  const word = await currentWord(page);
  await focusTyping(page);
  await page.keyboard.press("Escape");
  await page.locator(".ty-result").waitFor();
  await expect(page.getByText("打错或看了读音的 1 个")).toBeVisible();

  await page.evaluate(async () => {
    type StoredPack = {
      id: string;
      name: string;
      words: Array<{ key: string }>;
    };
    type StoredSession = {
      id: string;
      packId: string;
      wordSnapshots?: Record<string, unknown>;
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yomidojo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const readAll = <T,>(storeName: string) =>
      new Promise<T[]>((resolve, reject) => {
        const request = db
          .transaction(storeName, "readonly")
          .objectStore(storeName)
          .getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    const [packs, sessions] = await Promise.all([
      readAll<StoredPack>("packs"),
      readAll<StoredSession>("sessions"),
    ]);
    const pack = packs.find((entry) => entry.name === "旧结算无快照测试");
    if (!pack) throw new Error("测试词包不存在。");
    const session = sessions.find((entry) => entry.packId === pack.id);
    if (!session) throw new Error("测试结算不存在。");
    const updatedPack = { ...pack, words: [] };
    const updatedSession = { ...session };
    delete updatedSession.wordSnapshots;
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(["packs", "sessions"], "readwrite");
      transaction.objectStore("packs").put(updatedPack);
      transaction.objectStore("sessions").put(updatedSession);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    db.close();
  });

  await page.reload();
  await page.locator(".ty-result").waitFor();
  await expect(page.getByText("打错或看了读音的 1 个")).toBeVisible();
  await expect(page.locator(".ty-weak-row strong")).toHaveText(word.word);
  await expect(page.locator(".ty-weak-row.is-missing")).toHaveCount(1);
  const redo = page.getByRole("button", { name: "本组无法重打" });
  await expect(redo).toBeDisabled();
  await expect(
    page.getByText("本组词条已无法恢复，不能按原顺序重打。"),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /只练/ })).toHaveCount(0);
});

test("next group is a newly planned group and keeps prior records", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  await importPack(
    page,
    "分组续练测试",
    "円滑\tえんかつ\t顺利，顺畅\n肝心\tかんじん\t关键，要紧\n還元\tかんげん\t回馈，返还",
  );
  const first = await currentWord(page);
  await typeKana(page, first.reading);
  await page.locator(".ty-result").waitFor();

  await expect(
    page.getByRole("button", { name: "第 1 组再打一遍" }),
  ).toBeVisible();
  await expect(
    page.getByText("第一次打完第 1 组，用时就是纪录"),
  ).toBeVisible();
  await page.getByRole("button", { name: "下一组" }).click();
  await page.locator(".ty-practice .ty-word").waitFor();
  const next = await currentWord(page);
  expect(next.word).not.toBe(first.word);

  await page.reload();
  await expect(page.locator(".ty-practice .ty-word")).toHaveText(next.word);
});

test("custom-pack weak-word drill is saved to that pack, not the previous pack", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 2 });
  await importPack(
    page,
    "自定义加练归属测试",
    "円滑\tえんかつ\t顺利，顺畅\n肝心\tかんじん\t关键，要紧\n還元\tかんげん\t回馈，返还\n拍子\tひょうし\t节拍",
  );

  const first = await currentWord(page);
  await typeKana(page, first.reading);
  await page.waitForFunction(
    (previous) =>
      document.querySelector(".ty-word")?.textContent?.trim() !== previous,
    first.word,
  );

  const second = await currentWord(page);
  await focusTyping(page);
  await page.keyboard.press("q");
  await typeKana(page, second.reading);
  await page.locator(".ty-result").waitFor();
  const weakWord = (await page.locator(".ty-weak-row strong").first().innerText()).trim();
  await page.getByRole("button", { name: "只练这 1 个" }).click();
  await page.locator(".ty-practice .ty-word").waitFor();

  const state = await page.evaluate(async () => {
    type StoredPack = { id: string; name: string };
    type StoredPlan = {
      packId: string;
      activeSession: {
        packId: string;
        kind: string;
        drillKeys?: string[];
        queue: Array<{ key: string }>;
      } | null;
    };
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("yomidojo");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const readAll = <T,>(storeName: string) =>
      new Promise<T[]>((resolve, reject) => {
        const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
        request.onsuccess = () => resolve(request.result as T[]);
        request.onerror = () => reject(request.error);
      });
    const [packs, plans] = await Promise.all([
      readAll<StoredPack>("packs"),
      readAll<StoredPlan>("plans"),
    ]);
    db.close();
    const pack = packs.find((entry) => entry.name === "自定义加练归属测试");
    const plan = plans.find((entry) => entry.packId === pack?.id);
    return {
      packId: pack?.id ?? null,
      activePackId: plan?.activeSession?.packId ?? null,
      kind: plan?.activeSession?.kind ?? null,
      drillKeys: plan?.activeSession?.drillKeys ?? [],
      queueKeys: plan?.activeSession?.queue.map((item) => item.key) ?? [],
      queueLength: plan?.activeSession?.queue.length ?? 0,
    };
  });

  expect(state.packId).toBeTruthy();
  expect(state.activePackId).toBe(state.packId);
  expect(state.kind).toBe("drill");
  expect(state.drillKeys).toHaveLength(1);
  expect(state.drillKeys).toEqual(state.queueKeys);
  expect(state.queueLength).toBe(1);
  await expect(page.locator(".ty-word")).toHaveText(weakWord);
});

test("deleting the pack shown in a result never pairs it with the next pack", async ({
  page,
}) => {
  await gotoType(page, { batchSize: 1 });
  await importPack(
    page,
    "跨包删除测试",
    "龘\tたつ\t测试用字",
  );

  const word = await currentWord(page);
  await focusTyping(page);
  await page.keyboard.press("Escape");
  await page.locator(".ty-result").waitFor();
  await expect(page.getByText("打错或看了读音的 1 个")).toBeVisible();

  await openPackPanel(page);
  await page.getByRole("button", { name: "删除这个词包" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "删除「跨包删除测试」？" }),
  ).toBeVisible();

  await page.evaluate(() => {
    const state = window as Window & {
      __crossPackResults?: string[];
      __crossPackObserver?: MutationObserver;
    };
    state.__crossPackResults = [];
    state.__crossPackObserver = new MutationObserver(() => {
      const text = document.querySelector(".ty-result")?.textContent ?? "";
      if (
        text.includes("全部一次打对") ||
        text.includes("继续当前组")
      ) {
        state.__crossPackResults?.push(text);
      }
    });
    state.__crossPackObserver.observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  });

  await dialog.getByRole("button", { name: "删除词包", exact: true }).click();
  await page.locator(".ty-practice .ty-word").waitFor();

  const observed = await page.evaluate(() => {
    const state = window as Window & {
      __crossPackResults?: string[];
      __crossPackObserver?: MutationObserver;
    };
    state.__crossPackObserver?.disconnect();
    return {
      resultVisible: Boolean(document.querySelector(".ty-result")),
      transientResults: state.__crossPackResults ?? [],
    };
  });
  expect(observed.resultVisible).toBe(false);
  expect(observed.transientResults).toEqual([]);
  await expect(page.locator(".ty-word")).not.toHaveText(word.word);
});

test("built-in next group replans and an older result can resume the active group", async ({
  page,
}) => {
  const readPlan = () =>
    page.evaluate(async () => {
      type StoredPlan = {
        packId: string;
        lastResultId?: string;
        activeSession: {
          id: string;
          packId: string;
          kind: string;
          queue: Array<{ key: string }>;
        } | null;
      };
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("yomidojo");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const plan = await new Promise<StoredPlan | undefined>((resolve, reject) => {
        const request = db
          .transaction("plans", "readonly")
          .objectStore("plans")
          .get("builtin-n1");
        request.onsuccess = () => resolve(request.result as StoredPlan | undefined);
        request.onerror = () => reject(request.error);
      });
      db.close();
      return plan ?? null;
    });

  await gotoType(page, { batchSize: 1 });
  const first = await currentWord(page);
  await typeKana(page, first.reading);
  await page.locator(".ty-result").waitFor();
  const completed = await readPlan();
  expect(completed?.activeSession).toBeNull();
  expect(completed?.lastResultId).toBeTruthy();

  await page.getByRole("button", { name: "下一组" }).click();
  await page.locator(".ty-practice .ty-word").waitFor();
  const next = await currentWord(page);
  expect(next.word).not.toBe(first.word);
  const active = await readPlan();
  expect(active?.activeSession?.packId).toBe("builtin-n1");
  expect(active?.activeSession?.kind).toBe("normal");
  expect(active?.activeSession?.id).not.toBe(completed?.lastResultId);
  expect(active?.activeSession?.queue).toHaveLength(1);

  await openPackPanel(page);
  await page
    .locator("#ty-pack-panel")
    .getByRole("button", { name: "查看第 1 组结果" })
    .click();
  await page.locator(".ty-result").waitFor();
  await page.getByRole("button", { name: "继续当前组" }).click();

  await page.locator(".ty-practice .ty-word").waitFor();
  await expect(page.locator(".ty-word")).toHaveText(next.word);
  await expect(page.getByText("1 / 1", { exact: false }).first()).toBeVisible();
});
