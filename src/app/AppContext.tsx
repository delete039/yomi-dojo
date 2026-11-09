import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { makeWordKey } from "../lib/kana";
import {
  addAnswerToSession,
  buildSummary,
  createEmptyPlan,
  createPracticeSession,
  getPackProgress,
  isTypableWord,
  isSessionComplete,
  planQueue,
  snapshotWord,
  type PackProgress,
  type QueuePlan,
} from "../data/session";
import { applyAnswer } from "../data/srs";
import {
  clearAllAndReseed,
  clearLearningRecords,
  exportBackup,
  loadSnapshot,
  parseAndRestoreBackup,
  recordAnswer,
  removePack,
  replaceBuiltins,
  savePackAndPlan,
  savePackAndPlanAndSelect,
  savePack,
  savePlan,
  saveSelectedPack,
  saveSettings,
  type AppSnapshot,
} from "../data/repository";
import { normalizeSettings, DEFAULT_SETTINGS } from "../data/settings";
import type {
  AnswerResult,
  BackupData,
  Pack,
  PackPlan,
  PackWord,
  PracticeSession,
  SessionSummary,
  Settings,
  WordStat,
  WordSnapshot,
} from "../data/types";
import { hasKanji } from "../lib/kana";

export interface ToastMessage {
  id: string;
  message: string;
  tone: "info" | "success" | "error";
}

interface AppContextValue {
  ready: boolean;
  loading: boolean;
  error: string | null;
  packs: Pack[];
  plans: PackPlan[];
  sessions: SessionSummary[];
  wordStats: Map<string, WordStat>;
  settings: Settings;
  selectedPackId: string | null;
  selectedPack: Pack | null;
  selectedPlan: PackPlan | null;
  toasts: ToastMessage[];
  notify: (message: string, tone?: ToastMessage["tone"]) => void;
  dismissToast: (id: string) => void;
  retryLoad: () => Promise<void>;
  selectPack: (packId: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  createPack: (
    name: string,
    description: string,
    words?: PackWord[],
  ) => Promise<Pack>;
  updatePackMeta: (packId: string, patch: { name?: string; description?: string }) => Promise<void>;
  deletePack: (packId: string) => Promise<void>;
  addWordsToPack: (
    packId: string,
    words: PackWord[],
    options?: { updateExisting?: boolean },
  ) => Promise<number>;
  removeWordFromPack: (packId: string, key: string) => Promise<boolean>;
  previewQueue: (packId?: string, batchSize?: number) => QueuePlan | null;
  startSession: (options?: {
    packId?: string;
    forceNew?: boolean;
  }) => Promise<PracticeSession | null>;
  startDrill: (
    keys: string[],
    options?: {
      packId?: string;
      kind?: "retry" | "drill";
      retryOfSessionId?: string;
      wordSnapshots?: Record<string, WordSnapshot>;
    },
  ) => Promise<PracticeSession>;
  recordSessionAnswer: (
    answer: AnswerResult,
    sessionId?: string,
  ) => Promise<SessionSummary | null>;
  discardSession: (packId?: string) => Promise<void>;
  resetBuiltins: () => Promise<void>;
  clearLearning: () => Promise<void>;
  resetEverything: () => Promise<void>;
  makeBackup: () => Promise<BackupData>;
  restoreBackup: (text: string) => Promise<void>;
  progressForPack: (packId: string) => PackProgress | null;
}

const AppContext = createContext<AppContextValue | null>(null);

function messageFrom(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function buildPack(
  name: string,
  description: string,
  words: PackWord[],
  now = Date.now(),
): Pack {
  return {
    id: `pack-${crypto.randomUUID()}`,
    name: name.trim(),
    description: description.trim(),
    kind: "custom",
    words,
    createdAt: now,
    updatedAt: now,
  };
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const snapshotRef = useRef<AppSnapshot | null>(null);
  const settingsSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const mutationQueue = useRef<Promise<void>>(Promise.resolve());
  const toastTimers = useRef(new Map<string, number>());

  const enqueueMutation = useCallback(
    function enqueueMutation<T>(task: () => Promise<T>): Promise<T> {
      const run = mutationQueue.current.then(task, task);
      mutationQueue.current = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    },
    [],
  );

  const applySnapshot = useCallback((next: AppSnapshot) => {
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);

  const notify = useCallback((message: string, tone: ToastMessage["tone"] = "info") => {
    const id = crypto.randomUUID();
    setToasts((current) => [...current, { id, message, tone }]);
    const timer = window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
      toastTimers.current.delete(id);
    }, 3600);
    toastTimers.current.set(id, timer);
  }, []);

  useEffect(
    () => () => {
      for (const timer of toastTimers.current.values()) window.clearTimeout(timer);
    },
    [],
  );

  const dismissToast = useCallback((id: string) => {
    const timer = toastTimers.current.get(id);
    if (timer) window.clearTimeout(timer);
    toastTimers.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await loadSnapshot();
      applySnapshot(next);
    } catch (loadError) {
      setError(messageFrom(loadError));
    } finally {
      setLoading(false);
    }
  }, [applySnapshot]);

  useEffect(() => {
    void load();
  }, [load]);

  const packs = snapshot?.packs ?? [];
  const plans = snapshot?.plans ?? [];
  const sessions = snapshot?.sessions ?? [];
  const settings = snapshot?.settings ?? DEFAULT_SETTINGS;
  const selectedPackId = snapshot?.selectedPackId ?? null;

  const wordStats = useMemo(
    () => new Map((snapshot?.wordStats ?? []).map((stat) => [stat.key, stat])),
    [snapshot?.wordStats],
  );
  const selectedPack = useMemo(
    () => packs.find((pack) => pack.id === selectedPackId) ?? null,
    [packs, selectedPackId],
  );
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.packId === selectedPackId) ?? null,
    [plans, selectedPackId],
  );

  const requireSnapshot = useCallback((): AppSnapshot => {
    const current = snapshotRef.current;
    if (!current) throw new Error("应用尚未准备好。");
    return current;
  }, []);

  const selectPack = useCallback(
    (packId: string) =>
      enqueueMutation(async () => {
        const current = requireSnapshot();
        if (!current.packs.some((pack) => pack.id === packId)) {
          throw new Error("词包不存在。");
        }
        await saveSelectedPack(packId);
        const latest = requireSnapshot();
        applySnapshot({ ...latest, selectedPackId: packId });
      }),
    [applySnapshot, enqueueMutation, requireSnapshot],
  );

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const current = requireSnapshot();
      const nextSettings = normalizeSettings({ ...current.settings, ...patch });
      applySnapshot({ ...current, settings: nextSettings });
      const saveTask = settingsSaveQueue.current.then(async () => {
        const latest = requireSnapshot();
        await saveSettings(latest.settings);
      });
      settingsSaveQueue.current = saveTask.catch(() => undefined);
      try {
        await saveTask;
      } catch (error) {
        const latest = requireSnapshot();
        // Only roll back if no newer optimistic update has superseded this one.
        if (latest.settings === nextSettings) {
          applySnapshot({ ...latest, settings: current.settings });
        }
        throw error;
      }
    },
    [applySnapshot, requireSnapshot],
  );

  const createPack = useCallback(
    async (name: string, description: string, words: PackWord[] = []) => {
      if (!name.trim()) throw new Error("词包名称不能为空。");
      const current = requireSnapshot();
      const pack = buildPack(name, description, words);
      const plan = createEmptyPlan(pack.id);
      await savePackAndPlanAndSelect(pack, plan);
      applySnapshot({
        ...current,
        packs: [...current.packs, pack],
        plans: [...current.plans, plan],
        selectedPackId: pack.id,
      });
      return pack;
    },
    [applySnapshot, requireSnapshot],
  );

  const updatePackMeta = useCallback(
    async (packId: string, patch: { name?: string; description?: string }) => {
      const current = requireSnapshot();
      const pack = current.packs.find((item) => item.id === packId);
      if (!pack) throw new Error("词包不存在。");
      if (patch.name !== undefined && !patch.name.trim()) {
        throw new Error("词包名称不能为空。");
      }
      const updated: Pack = {
        ...pack,
        name: patch.name?.trim() ?? pack.name,
        description: patch.description?.trim() ?? pack.description,
        updatedAt: Date.now(),
      };
      await savePack(updated);
      applySnapshot({
        ...current,
        packs: current.packs.map((item) => (item.id === packId ? updated : item)),
      });
    },
    [applySnapshot, requireSnapshot],
  );

  const deletePack = useCallback(
    async (packId: string) => {
      const current = requireSnapshot();
      const pack = current.packs.find((item) => item.id === packId);
      if (!pack) return;
      await removePack(packId);
      const nextPacks = current.packs.filter((item) => item.id !== packId);
      const nextPlans = current.plans.filter((item) => item.packId !== packId);
      const nextSelected =
        current.selectedPackId === packId
          ? (nextPacks[0]?.id ?? null)
          : current.selectedPackId;
      if (nextSelected !== current.selectedPackId) {
        await saveSelectedPack(nextSelected);
      }
      applySnapshot({
        ...current,
        packs: nextPacks,
        plans: nextPlans,
        selectedPackId: nextSelected,
      });
    },
    [applySnapshot, requireSnapshot],
  );

  const addWordsToPack = useCallback(
    async (
      packId: string,
      words: PackWord[],
      options?: { updateExisting?: boolean },
    ) => {
      const current = requireSnapshot();
      const pack = current.packs.find((item) => item.id === packId);
      if (!pack) throw new Error("词包不存在。");
      const existing = new Map(pack.words.map((word) => [word.key, word]));
      let changed = 0;
      for (const word of words) {
        const key = makeWordKey(word.word, word.reading);
        const previous = existing.get(key);
        if (previous) {
          if (options?.updateExisting) {
            existing.set(key, {
              ...previous,
              meaning: word.meaning || previous.meaning,
              jlpt: word.jlpt || previous.jlpt,
              pos: word.pos || previous.pos,
              altReadings: word.altReadings?.length
                ? word.altReadings
                : previous.altReadings,
              hasKanji: hasKanji(previous.word),
            });
            changed += 1;
          }
          continue;
        }
        const normalized: PackWord = {
          ...word,
          key,
          hasKanji: hasKanji(word.word),
        };
        existing.set(key, normalized);
        changed += 1;
      }
      if (changed === 0) return 0;
      const updated: Pack = {
        ...pack,
        words: Array.from(existing.values()),
        updatedAt: Date.now(),
      };
      await savePack(updated);
      applySnapshot({
        ...current,
        packs: current.packs.map((item) => (item.id === packId ? updated : item)),
      });
      return changed;
    },
    [applySnapshot, requireSnapshot],
  );

  const removeWordFromPack = useCallback(
    async (packId: string, key: string) => {
      const current = requireSnapshot();
      const pack = current.packs.find((item) => item.id === packId);
      if (!pack) throw new Error("词包不存在。");
      const updated: Pack = {
        ...pack,
        words: pack.words.filter((word) => word.key !== key),
        updatedAt: Date.now(),
      };
      const plan =
        current.plans.find((item) => item.packId === packId) ?? createEmptyPlan(packId);
      const hasActiveWord = plan.activeSession?.queue
        .slice(plan.activeSession.currentIndex)
        .some((item) => item.key === key);
      const nextPlan = hasActiveWord
        ? { ...plan, activeSession: null, updatedAt: Date.now() }
        : plan;
      await savePackAndPlan(updated, nextPlan);
      applySnapshot({
        ...current,
        packs: current.packs.map((item) => (item.id === packId ? updated : item)),
        plans: current.plans.map((item) => (item.packId === packId ? nextPlan : item)),
      });
      return Boolean(hasActiveWord);
    },
    [applySnapshot, requireSnapshot],
  );

  const previewQueue = useCallback(
    (packId = selectedPackId ?? "", batchSize?: number): QueuePlan | null => {
      const current = snapshotRef.current;
      if (!current) return null;
      const pack = current.packs.find((item) => item.id === packId);
      if (!pack) return null;
      const statsMap = new Map(current.wordStats.map((stat) => [stat.key, stat]));
      return planQueue(
        pack,
        statsMap,
        {
          ...current.settings,
          batchSize: batchSize ?? current.settings.batchSize,
        },
      );
    },
    [selectedPackId],
  );

  const startSession = useCallback(
    (options?: { packId?: string; forceNew?: boolean }) =>
      enqueueMutation(async () => {
        const current = requireSnapshot();
        const packId = options?.packId ?? current.selectedPackId;
        const pack = current.packs.find((item) => item.id === packId);
        if (!pack) throw new Error("请先选择一个词包。");
        const plan =
          current.plans.find((item) => item.packId === pack.id) ??
          createEmptyPlan(pack.id);
        if (plan.activeSession && !options?.forceNew) return plan.activeSession;
        const statsMap = new Map(current.wordStats.map((stat) => [stat.key, stat]));
        const planned = planQueue(pack, statsMap, current.settings);
        if (planned.queue.length === 0) return null;
        const session = createPracticeSession(
          pack,
          planned.queue,
          planned.composition,
        );
        const nextPlan: PackPlan = {
          ...plan,
          activeSession: session,
          lastResultId: undefined,
          lastResultAt: undefined,
          updatedAt: Date.now(),
        };
        await savePlan(nextPlan);
        const latest = requireSnapshot();
        applySnapshot({
          ...latest,
          plans: latest.plans.map((item) =>
            item.packId === pack.id ? nextPlan : item,
          ),
        });
        return session;
      }),
    [applySnapshot, enqueueMutation, requireSnapshot],
  );

  const startDrill = useCallback(
    (
      keys: string[],
      options?: {
        packId?: string;
        kind?: "retry" | "drill";
        retryOfSessionId?: string;
        wordSnapshots?: Record<string, WordSnapshot>;
      },
    ) =>
      enqueueMutation(async () => {
        const current = requireSnapshot();
        const packId = options?.packId ?? current.selectedPackId;
        const pack = current.packs.find((item) => item.id === packId);
        if (!pack) throw new Error("请先选择一个词包。");
        const plan =
          current.plans.find((item) => item.packId === pack.id) ??
          createEmptyPlan(pack.id);
        const packWords = new Map(
          pack.words.filter(isTypableWord).map((word) => [word.key, word]),
        );
        const wordSnapshots: Record<string, WordSnapshot> = {};
        const queue: PracticeSession["queue"] = [];
        const seen = new Set<string>();
        for (const key of keys) {
          if (seen.has(key)) continue;
          const currentWord = packWords.get(key);
          const snapshot = currentWord
            ? snapshotWord(currentWord)
            : options?.wordSnapshots?.[key];
          if (
            !snapshot ||
            snapshot.key !== key ||
            !snapshot.word.trim() ||
            !snapshot.reading.trim()
          ) {
            continue;
          }
          seen.add(key);
          wordSnapshots[key] = snapshot;
          queue.push({
            key,
            mode: "relearn",
            reason: options?.kind === "retry" ? "重打本组" : "错词加练",
          });
        }
        if (queue.length === 0) throw new Error("没有可加练的词。");
        const composition = queue.reduce(
          (result, entry) => {
            result[entry.mode] += 1;
            return result;
          },
          { new: 0, review: 0, reinforce: 0, relearn: 0 },
        );
        const session: PracticeSession = {
          ...createPracticeSession(pack, queue, composition, Date.now(), {
            kind: options?.kind ?? "drill",
            retryOfSessionId: options?.retryOfSessionId,
            wordSnapshots,
          }),
          drillKeys: queue.map((entry) => entry.key),
        };
        const nextPlan: PackPlan = {
          ...plan,
          activeSession: session,
          lastResultId: undefined,
          lastResultAt: undefined,
          updatedAt: Date.now(),
        };
        await savePlan(nextPlan);
        const latest = requireSnapshot();
        applySnapshot({
          ...latest,
          plans: latest.plans.map((item) =>
            item.packId === pack.id ? nextPlan : item,
          ),
        });
        return session;
      }),
    [applySnapshot, enqueueMutation, requireSnapshot],
  );

  const recordSessionAnswer = useCallback(
    (answer: AnswerResult, sessionId?: string) =>
      enqueueMutation(async () => {
        const current = requireSnapshot();
        const locatedPlan = sessionId
          ? current.plans.find((entry) => entry.activeSession?.id === sessionId)
          : current.plans.find(
              (entry) => entry.packId === current.selectedPackId,
            );
        if (!locatedPlan) throw new Error("当前没有进行中的练习。");
        const pack = current.packs.find((item) => item.id === locatedPlan.packId);
        if (!pack) throw new Error("词包不存在。");
        const session = locatedPlan.activeSession;
        if (!session) throw new Error("当前没有进行中的练习。");
        if (sessionId && session.id !== sessionId) {
          throw new Error("练习会话已经变化，请重新载入。");
        }
        const item = session.queue[session.currentIndex];
        if (!item || item.key !== answer.wordKey) {
          throw new Error("练习进度已变化，请重新载入。");
        }
        const word =
          pack.words.find((candidate) => candidate.key === answer.wordKey) ??
          session.wordSnapshots?.[answer.wordKey];
        if (!word) throw new Error("词条已从词包移除，且没有可用的练习快照。");
        const now = answer.answeredAt;
        const updatedSession = addAnswerToSession(session, answer, now);
        const previousStat = current.wordStats.find((stat) => stat.key === word.key);
        const updatedStat = applyAnswer(previousStat, word, answer, now);
        const complete = isSessionComplete(updatedSession);
        const summary = complete ? buildSummary(updatedSession, undefined, now) : null;
        const countsAsCompletedGroup =
          (updatedSession.kind ?? "normal") === "normal";
        const nextPlan: PackPlan = complete
          ? {
              ...locatedPlan,
              activeSession: null,
              completedSessions:
                locatedPlan.completedSessions +
                (countsAsCompletedGroup ? 1 : 0),
              lastCompletedAt: now,
              lastResultId: summary?.id,
              lastResultAt: now,
              updatedAt: now,
            }
          : { ...locatedPlan, activeSession: updatedSession, updatedAt: now };
        await recordAnswer(nextPlan, updatedStat, summary ?? undefined);

        const latest = requireSnapshot();
        const nextStats = latest.wordStats.some(
          (stat) => stat.key === updatedStat.key,
        )
          ? latest.wordStats.map((stat) =>
              stat.key === updatedStat.key ? updatedStat : stat,
            )
          : [updatedStat, ...latest.wordStats];
        applySnapshot({
          ...latest,
          plans: latest.plans.map((entry) =>
            entry.packId === locatedPlan.packId ? nextPlan : entry,
          ),
          wordStats: nextStats,
          sessions: summary ? [summary, ...latest.sessions] : latest.sessions,
        });
        return summary;
      }),
    [applySnapshot, enqueueMutation, requireSnapshot],
  );

  const discardSession = useCallback(
    async (packId = selectedPackId ?? "") => {
      const current = requireSnapshot();
      const plan = current.plans.find((item) => item.packId === packId);
      if (!plan) return;
      const nextPlan = { ...plan, activeSession: null, updatedAt: Date.now() };
      await savePlan(nextPlan);
      applySnapshot({
        ...current,
        plans: current.plans.map((item) => (item.packId === packId ? nextPlan : item)),
      });
    },
    [applySnapshot, requireSnapshot, selectedPackId],
  );

  const resetBuiltins = useCallback(async () => {
    await replaceBuiltins();
    const next = await loadSnapshot();
    applySnapshot(next);
  }, [applySnapshot]);

  const clearLearning = useCallback(async () => {
    await clearLearningRecords();
    const current = requireSnapshot();
    const next = {
      ...current,
      wordStats: [],
      sessions: [],
      plans: current.plans.map((plan) => ({
        ...plan,
        activeSession: null,
        completedSessions: 0,
        lastCompletedAt: undefined,
        lastResultId: undefined,
        lastResultAt: undefined,
        updatedAt: Date.now(),
      })),
    };
    applySnapshot(next);
  }, [applySnapshot, requireSnapshot]);

  const resetEverything = useCallback(async () => {
    const next = await clearAllAndReseed();
    applySnapshot(next);
  }, [applySnapshot]);

  const makeBackup = useCallback(async () => {
    return exportBackup(requireSnapshot());
  }, [requireSnapshot]);

  const restoreBackup = useCallback(
    async (text: string) => {
      const next = await parseAndRestoreBackup(text);
      applySnapshot(next);
    },
    [applySnapshot],
  );

  const progressForPack = useCallback(
    (packId: string) => {
      const current = snapshotRef.current;
      if (!current) return null;
      const pack = current.packs.find((item) => item.id === packId);
      if (!pack) return null;
      const map = new Map(current.wordStats.map((stat) => [stat.key, stat]));
      return getPackProgress(pack, map);
    },
    [],
  );

  const value: AppContextValue = {
    ready: Boolean(snapshot) && !error,
    loading,
    error,
    packs,
    plans,
    sessions,
    wordStats,
    settings,
    selectedPackId,
    selectedPack,
    selectedPlan,
    toasts,
    notify,
    dismissToast,
    retryLoad: load,
    selectPack,
    updateSettings,
    createPack,
    updatePackMeta,
    deletePack,
    addWordsToPack,
    removeWordFromPack,
    previewQueue,
    startSession,
    startDrill,
    recordSessionAnswer,
    discardSession,
    resetBuiltins,
    clearLearning,
    resetEverything,
    makeBackup,
    restoreBackup,
    progressForPack,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp 必须在 AppProvider 内使用。");
  return context;
}
