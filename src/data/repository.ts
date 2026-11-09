import { fetchBuiltinPacks } from "./builtins";
import {
  clearStore,
  deleteOne,
  getAll,
  getOne,
  persistAnswerTransaction,
  putMany,
  putOne,
  replaceAllStores,
  STORE,
} from "./db";
import { normalizeSettings, DEFAULT_SETTINGS } from "./settings";
import { createEmptyPlan } from "./session";
import type {
  AppMeta,
  BackupData,
  Pack,
  PackPlan,
  SessionSummary,
  Settings,
  WordStat,
} from "./types";

const META = {
  seedVersion: "seedVersion",
  settings: "settings",
  selectedPackId: "selectedPackId",
} as const;

const CURRENT_SEED_VERSION = 1;

export interface AppSnapshot {
  packs: Pack[];
  plans: PackPlan[];
  wordStats: WordStat[];
  sessions: SessionSummary[];
  settings: Settings;
  selectedPackId: string | null;
}

function sortPacks(packs: Pack[]): Pack[] {
  return [...packs].sort((a, b) => {
    const builtinOrder = { N1: 0, N2: 1 } as const;
    const aOrder =
      a.kind === "builtin" && a.builtinLevel
        ? builtinOrder[a.builtinLevel]
        : 10;
    const bOrder =
      b.kind === "builtin" && b.builtinLevel
        ? builtinOrder[b.builtinLevel]
        : 10;
    return aOrder - bOrder || a.createdAt - b.createdAt || a.name.localeCompare(b.name);
  });
}

async function readMetaValue<T>(key: string): Promise<T | undefined> {
  const meta = await getOne<AppMeta>(STORE.meta, key);
  return meta?.value as T | undefined;
}

async function writeMetaValue(key: string, value: unknown): Promise<void> {
  await putOne<AppMeta>(STORE.meta, { key, value });
}

async function seedIfNeeded(): Promise<void> {
  const seedVersion = await readMetaValue<number>(META.seedVersion);
  if (seedVersion === CURRENT_SEED_VERSION) return;
  const packs = await fetchBuiltinPacks();
  const plans = packs.map((pack) => createEmptyPlan(pack.id));
  await putMany(STORE.packs, packs);
  await putMany(STORE.plans, plans);
  await writeMetaValue(META.seedVersion, CURRENT_SEED_VERSION);
  await writeMetaValue(META.settings, DEFAULT_SETTINGS);
}

export async function loadSnapshot(): Promise<AppSnapshot> {
  await seedIfNeeded();
  const [packs, plans, wordStats, sessions, storedSettings, selectedPackId] =
    await Promise.all([
      getAll<Pack>(STORE.packs),
      getAll<PackPlan>(STORE.plans),
      getAll<WordStat>(STORE.wordStats),
      getAll<SessionSummary>(STORE.sessions),
      readMetaValue<Settings>(META.settings),
      readMetaValue<string>(META.selectedPackId),
    ]);
  const sortedPacks = sortPacks(packs);
  const planMap = new Map(plans.map((plan) => [plan.packId, plan]));
  const missingPlans = sortedPacks
    .filter((pack) => !planMap.has(pack.id))
    .map((pack) => createEmptyPlan(pack.id));
  if (missingPlans.length > 0) await putMany(STORE.plans, missingPlans);
  for (const plan of missingPlans) planMap.set(plan.packId, plan);

  const validSelected =
    selectedPackId && sortedPacks.some((pack) => pack.id === selectedPackId)
      ? selectedPackId
      : (sortedPacks[0]?.id ?? null);
  if (validSelected !== selectedPackId) {
    await writeMetaValue(META.selectedPackId, validSelected);
  }

  return {
    packs: sortedPacks,
    plans: sortedPacks
      .map((pack) => planMap.get(pack.id))
      .filter((plan): plan is PackPlan => Boolean(plan)),
    wordStats: wordStats.sort((a, b) => b.lastReviewedAt - a.lastReviewedAt),
    sessions: sessions.sort((a, b) => b.endedAt - a.endedAt),
    settings: normalizeSettings(storedSettings),
    selectedPackId: validSelected,
  };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await writeMetaValue(META.settings, settings);
}

export async function saveSelectedPack(packId: string | null): Promise<void> {
  await writeMetaValue(META.selectedPackId, packId);
}

export async function savePack(pack: Pack): Promise<void> {
  await putOne(STORE.packs, pack);
}

export async function savePlan(plan: PackPlan): Promise<void> {
  await putOne(STORE.plans, plan);
}

export async function savePackAndPlan(pack: Pack, plan?: PackPlan): Promise<void> {
  await putOne(STORE.packs, pack);
  if (plan) await putOne(STORE.plans, plan);
}

export async function savePackAndPlanAndSelect(
  pack: Pack,
  plan: PackPlan,
): Promise<void> {
  await putOne(STORE.packs, pack);
  await putOne(STORE.plans, plan);
  await saveSelectedPack(pack.id);
}

export async function removePack(packId: string): Promise<void> {
  await deleteOne(STORE.packs, packId);
  await deleteOne(STORE.plans, packId);
}

export async function recordAnswer(
  plan: PackPlan,
  stat: WordStat,
  summary?: SessionSummary,
): Promise<void> {
  await persistAnswerTransaction(plan, stat, summary);
}

export async function replaceBuiltins(): Promise<Pack[]> {
  const seeded = await fetchBuiltinPacks();
  const existing = await getAll<Pack>(STORE.packs);
  const existingMap = new Map(existing.map((pack) => [pack.id, pack]));
  const updated = seeded.map((pack) => {
    const old = existingMap.get(pack.id);
    return {
      ...pack,
      createdAt: old?.createdAt ?? pack.createdAt,
      updatedAt: Date.now(),
    };
  });
  await putMany(STORE.packs, updated);
  for (const pack of updated) {
    const plan = await getOne<PackPlan>(STORE.plans, pack.id);
    if (plan) {
      await putOne(STORE.plans, {
        ...plan,
        activeSession: null,
        updatedAt: Date.now(),
      });
    } else {
      await putOne(STORE.plans, createEmptyPlan(pack.id));
    }
  }
  return updated;
}

export async function clearLearningRecords(): Promise<void> {
  await clearStore(STORE.wordStats);
  await clearStore(STORE.sessions);
  const plans = await getAll<PackPlan>(STORE.plans);
  const now = Date.now();
  const reset = plans.map((plan) => ({
    ...plan,
    activeSession: null,
    completedSessions: 0,
    lastCompletedAt: undefined,
    lastResultId: undefined,
    lastResultAt: undefined,
    updatedAt: now,
  }));
  await putMany(STORE.plans, reset);
}

export async function clearAllAndReseed(): Promise<AppSnapshot> {
  await Promise.all([
    clearStore(STORE.packs),
    clearStore(STORE.plans),
    clearStore(STORE.wordStats),
    clearStore(STORE.sessions),
    clearStore(STORE.meta),
  ]);
  return loadSnapshot();
}

export async function exportBackup(snapshot: AppSnapshot): Promise<BackupData> {
  return {
    format: "yomidojo-backup",
    version: 1,
    appVersion: "1.0.0",
    exportedAt: new Date().toISOString(),
    settings: snapshot.settings,
    packs: snapshot.packs,
    plans: snapshot.plans,
    wordStats: snapshot.wordStats,
    sessions: snapshot.sessions,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

export function assertBackup(value: unknown): asserts value is BackupData {
  if (!value || typeof value !== "object") throw new Error("备份文件内容为空。");
  const backup = value as Partial<BackupData>;
  if (backup.format !== "yomidojo-backup" || backup.version !== 1) {
    throw new Error("不是受支持的読み道場备份文件。");
  }
  if (
    !Array.isArray(backup.packs) ||
    !Array.isArray(backup.plans) ||
    !Array.isArray(backup.wordStats) ||
    !Array.isArray(backup.sessions)
  ) {
    throw new Error("备份文件缺少词包或学习记录数据。");
  }
  const packIds = new Set<string>();
  for (const pack of backup.packs) {
    if (!pack || typeof pack.id !== "string" || !Array.isArray(pack.words)) {
      throw new Error("备份中存在损坏的词包。");
    }
    if (packIds.has(pack.id)) {
      throw new Error("备份中存在重复的词包标识。");
    }
    packIds.add(pack.id);
    for (const word of pack.words) {
      if (
        !word ||
        typeof word.key !== "string" ||
        typeof word.word !== "string" ||
        typeof word.reading !== "string" ||
        typeof word.hasKanji !== "boolean"
      ) {
        throw new Error("备份中存在损坏的词条。");
      }
    }
  }
  const planIds = new Set<string>();
  for (const plan of backup.plans) {
    if (!plan || typeof plan.packId !== "string") {
      throw new Error("备份中存在损坏的词包计划。");
    }
    if (planIds.has(plan.packId)) {
      throw new Error("备份中存在重复的词包计划。");
    }
    planIds.add(plan.packId);
    const active = plan.activeSession;
    if (
      active !== null &&
      (!isRecord(active) ||
        active.packId !== plan.packId ||
        !Array.isArray(active.queue) ||
        !Array.isArray(active.answers) ||
        typeof active.currentIndex !== "number")
    ) {
      throw new Error("备份中存在损坏的未完成练习。");
    }
  }
  const statKeys = new Set<string>();
  for (const stat of backup.wordStats) {
    if (!stat || typeof stat.key !== "string" || typeof stat.attempts !== "number") {
      throw new Error("备份中存在损坏的词汇记录。");
    }
    if (statKeys.has(stat.key)) {
      throw new Error("备份中存在重复的词汇记录。");
    }
    statKeys.add(stat.key);
  }
  const sessionIds = new Set<string>();
  for (const session of backup.sessions) {
    if (
      !session ||
      typeof session.id !== "string" ||
      typeof session.packId !== "string" ||
      !Array.isArray(session.answers)
    ) {
      throw new Error("备份中存在损坏的练习会话。");
    }
    if (sessionIds.has(session.id)) {
      throw new Error("备份中存在重复的练习会话。");
    }
    sessionIds.add(session.id);
  }
}

export async function parseAndRestoreBackup(text: string): Promise<AppSnapshot> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("备份文件不是有效 JSON。");
  }
  assertBackup(parsed);
  const settings = normalizeSettings(parsed.settings);
  const packIds = new Set(parsed.packs.map((pack) => pack.id));
  const plans = parsed.plans.filter((plan) => packIds.has(plan.packId));
  for (const pack of parsed.packs) {
    if (!plans.some((plan) => plan.packId === pack.id)) {
      plans.push(createEmptyPlan(pack.id));
    }
  }
  const selectedPackId = parsed.packs[0]?.id ?? null;
  await replaceAllStores({
    [STORE.packs]: parsed.packs,
    [STORE.plans]: plans,
    [STORE.wordStats]: parsed.wordStats,
    [STORE.sessions]: parsed.sessions,
  });
  await writeMetaValue(META.settings, settings);
  await writeMetaValue(META.selectedPackId, selectedPackId);
  await writeMetaValue(META.seedVersion, CURRENT_SEED_VERSION);
  return loadSnapshot();
}

export async function getStorageEstimate(): Promise<{
  usage: number;
  quota: number;
  persisted: boolean;
}> {
  let usage = 0;
  let quota = 0;
  let persisted = false;
  if (navigator.storage?.estimate) {
    const estimate = await navigator.storage.estimate();
    usage = estimate.usage ?? 0;
    quota = estimate.quota ?? 0;
  }
  if (navigator.storage?.persisted) {
    persisted = await navigator.storage.persisted();
  }
  return { usage, quota, persisted };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  return navigator.storage.persist();
}
