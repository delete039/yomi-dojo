const DB_NAME = "yomidojo";
const DB_VERSION = 1;

export const STORE = {
  packs: "packs",
  plans: "plans",
  wordStats: "wordStats",
  sessions: "sessions",
  meta: "meta",
} as const;

let databasePromise: Promise<IDBDatabase> | null = null;

export function openDatabase(): Promise<IDBDatabase> {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("当前浏览器不支持 IndexedDB，无法保存学习数据。"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE.packs)) {
        db.createObjectStore(STORE.packs, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE.plans)) {
        db.createObjectStore(STORE.plans, { keyPath: "packId" });
      }
      if (!db.objectStoreNames.contains(STORE.wordStats)) {
        const stats = db.createObjectStore(STORE.wordStats, { keyPath: "key" });
        stats.createIndex("dueAt", "dueAt", { unique: false });
        stats.createIndex("lastReviewedAt", "lastReviewedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE.sessions)) {
        const sessions = db.createObjectStore(STORE.sessions, { keyPath: "id" });
        sessions.createIndex("endedAt", "endedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE.meta)) {
        db.createObjectStore(STORE.meta, { keyPath: "key" });
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error("无法打开本地数据库。"));
    request.onblocked = () => {
      reject(new Error("数据库正在被另一个页面占用，请关闭其他标签页后重试。"));
    };
  });
  return databasePromise;
}

export async function getAll<T>(storeName: string): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error ?? new Error("读取数据失败。"));
  });
}

export async function getOne<T>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, "readonly").objectStore(storeName).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error ?? new Error("读取数据失败。"));
  });
}

export async function putOne<T>(storeName: string, value: T): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("保存数据失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("保存已取消。"));
  });
}

export async function putMany<T>(storeName: string, values: T[]): Promise<void> {
  if (values.length === 0) return;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    for (const value of values) store.put(value);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("保存数据失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("保存已取消。"));
  });
}

export async function deleteOne(storeName: string, key: IDBValidKey): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(key);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("删除数据失败。"));
  });
}

export async function clearStore(storeName: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).clear();
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("清空数据失败。"));
  });
}

export async function replaceAllStores(
  values: Partial<Record<(typeof STORE)[keyof typeof STORE], unknown[]>>,
): Promise<void> {
  const db = await openDatabase();
  const storeNames = Object.keys(values) as Array<keyof typeof values>;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeNames, "readwrite");
    for (const storeName of storeNames) {
      const store = transaction.objectStore(storeName);
      store.clear();
      for (const value of values[storeName] ?? []) store.put(value);
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("写入备份失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("写入备份已取消。"));
  });
}

export async function persistAnswerTransaction(
  plan: unknown,
  stat: unknown,
  summary?: unknown,
): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(
      summary ? [STORE.plans, STORE.wordStats, STORE.sessions] : [STORE.plans, STORE.wordStats],
      "readwrite",
    );
    transaction.objectStore(STORE.plans).put(plan);
    transaction.objectStore(STORE.wordStats).put(stat);
    if (summary) transaction.objectStore(STORE.sessions).put(summary);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("保存练习进度失败。"));
    transaction.onabort = () => reject(transaction.error ?? new Error("保存练习进度已取消。"));
  });
}
