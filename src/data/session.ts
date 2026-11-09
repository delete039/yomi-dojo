import { clamp } from "../lib/utils";
import type {
  AnswerResult,
  Pack,
  PackPlan,
  PackWord,
  PracticeKind,
  PracticeSession,
  QueueItem,
  SessionComposition,
  SessionSummary,
  Settings,
  WordStat,
  WordSnapshot,
} from "./types";

const DAY = 86_400_000;

export interface QueuePlan {
  queue: QueueItem[];
  composition: SessionComposition;
  availableNew: number;
  limitedByNewLimit: boolean;
  missingTypableWords: number;
}

/** A word can enter typing practice only when it has both kanji and a reading. */
export function isTypableWord(word: PackWord): boolean {
  return Boolean(
    word &&
      word.hasKanji === true &&
      typeof word.key === "string" &&
      word.key.length > 0 &&
      typeof word.word === "string" &&
      word.word.trim().length > 0 &&
      typeof word.reading === "string" &&
      word.reading.trim().length > 0,
  );
}

function uniqueStatsForPack(
  pack: Pack,
  stats: Map<string, WordStat>,
): Array<{ word: PackWord; stat: WordStat | undefined }> {
  const seen = new Set<string>();
  const rows: Array<{ word: PackWord; stat: WordStat | undefined }> = [];
  for (const word of pack.words) {
    if (!isTypableWord(word) || seen.has(word.key)) continue;
    seen.add(word.key);
    rows.push({ word, stat: stats.get(word.key) });
  }
  return rows;
}

export function snapshotWord(word: PackWord): WordSnapshot {
  return {
    key: word.key,
    word: word.word,
    reading: word.reading,
    meaning: word.meaning,
    altReadings: word.altReadings?.length ? [...word.altReadings] : undefined,
  };
}

function countNewToday(stats: Map<string, WordStat>, now: number): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  const start = date.getTime();
  let count = 0;
  for (const stat of stats.values()) {
    if (stat.attempts > 0 && stat.firstSeenAt >= start) count += 1;
  }
  return count;
}

function dueScore(stat: WordStat, now: number): number {
  const overdueDays = Math.max(0, (now - stat.dueAt) / DAY);
  return (
    overdueDays * 2.2 +
    (1 - stat.accuracy) * 2.5 +
    (stat.lastResult === "correct" ? 0 : 1) +
    (stat.streak === 0 ? 0.5 : 0) -
    stat.mastery / 120
  );
}

function weaknessScore(stat: WordStat): number {
  return (100 - stat.mastery) / 100 + (1 - stat.accuracy) * 1.5 + stat.lapses * 0.1;
}

/** Interleave two ordered lists while preserving their internal order. */
function interleave(review: QueueItem[], fresh: QueueItem[]): QueueItem[] {
  const output: QueueItem[] = [];
  let reviewIndex = 0;
  let newIndex = 0;
  while (reviewIndex < review.length || newIndex < fresh.length) {
    if (reviewIndex < review.length) output.push(review[reviewIndex++]);
    if (reviewIndex < review.length && reviewIndex % 3 === 0 && newIndex < fresh.length) {
      output.push(fresh[newIndex++]);
    } else if (reviewIndex >= review.length && newIndex < fresh.length) {
      output.push(fresh[newIndex++]);
    }
  }
  return output;
}

/**
 * Select one dynamic batch from the *whole* pack.
 *
 * Priority: overdue reviews -> new words (honoring an optional daily cap) ->
 * weakest upcoming words to fill the requested batch.
 */
export function planQueue(
  pack: Pack,
  stats: Map<string, WordStat>,
  settings: Settings,
  now = Date.now(),
  options?: { forceKeys?: string[] },
): QueuePlan {
  const rows = uniqueStatsForPack(pack, stats);
  const missingTypableWords = pack.words.filter(
    (word) => !isTypableWord(word),
  ).length;
  const forced = new Set(options?.forceKeys ?? []);

  if (forced.size > 0) {
    const rowsByKey = new Map(rows.map(({ word }) => [word.key, word]));
    const seen = new Set<string>();
    const queue: QueueItem[] = [];
    for (const key of options?.forceKeys ?? []) {
      if (seen.has(key)) continue;
      const word = rowsByKey.get(key);
      if (!word) continue;
      seen.add(key);
      queue.push({
        key: word.key,
        mode: "relearn",
        reason: "错词加练",
      });
    }
    return {
      queue,
      composition: { new: 0, review: 0, reinforce: 0, relearn: queue.length },
      availableNew: 0,
      limitedByNewLimit: false,
      missingTypableWords,
    };
  }

  const dueRows = rows
    .filter(({ stat }) => stat && stat.attempts > 0 && stat.dueAt <= now)
    .sort((a, b) => dueScore(b.stat!, now) - dueScore(a.stat!, now));
  const newRows = rows.filter(({ stat }) => !stat || stat.attempts === 0);
  const futureRows = rows
    .filter(({ stat }) => stat && stat.attempts > 0 && stat.dueAt > now)
    .sort((a, b) => weaknessScore(b.stat!) - weaknessScore(a.stat!));

  const newToday = countNewToday(stats, now);
  const remainingNew =
    settings.dailyNewLimit === 0
      ? Number.POSITIVE_INFINITY
      : Math.max(0, settings.dailyNewLimit - newToday);
  const batchSize = clamp(Math.round(settings.batchSize), 1, 200);

  const reviewQueue: QueueItem[] = dueRows.slice(0, batchSize).map(({ word }) => ({
    key: word.key,
    mode: "review",
    reason: "到期复习",
  }));
  const freshSlots = Math.max(0, batchSize - reviewQueue.length);
  const newCount = Math.min(freshSlots, newRows.length, remainingNew);
  const newQueue: QueueItem[] = newRows.slice(0, newCount).map(({ word }) => ({
    key: word.key,
    mode: "new",
    reason: "新词",
  }));

  let queue = interleave(reviewQueue, newQueue);
  const chosen = new Set(queue.map((item) => item.key));
  const remainingSlots = Math.max(0, batchSize - queue.length);
  if (remainingSlots > 0) {
    const fillers = futureRows
      .filter(({ word }) => !chosen.has(word.key))
      .slice(0, remainingSlots)
      .map<QueueItem>(({ word }) => ({
        key: word.key,
        mode: "reinforce",
        reason: "提前巩固",
      }));
    queue = [...queue, ...fillers];
  }

  // A brand-new user with a very low daily cap can end up with an empty queue.
  // Do not silently violate the cap; the setup screen explains this state.
  const limitedByNewLimit =
    queue.length === 0 && newRows.length > 0 && remainingNew === 0;

  const composition = queue.reduce<SessionComposition>(
    (result, item) => {
      result[item.mode] += 1;
      return result;
    },
    { new: 0, review: 0, reinforce: 0, relearn: 0 },
  );

  return {
    queue,
    composition,
    availableNew: newRows.length,
    limitedByNewLimit,
    missingTypableWords,
  };
}

export function createPracticeSession(
  pack: Pack,
  queue: QueueItem[],
  composition: SessionComposition,
  now = Date.now(),
  options?: {
    kind?: PracticeKind;
    retryOfSessionId?: string;
    wordSnapshots?: Record<string, WordSnapshot>;
  },
): PracticeSession {
  const snapshots = { ...(options?.wordSnapshots ?? {}) };
  for (const item of queue) {
    if (snapshots[item.key]) continue;
    const word = pack.words.find((candidate) => candidate.key === item.key);
    if (word) snapshots[item.key] = snapshotWord(word);
  }
  return {
    id: crypto.randomUUID(),
    packId: pack.id,
    packName: pack.name,
    startedAt: now,
    updatedAt: now,
    batchSize: queue.length,
    queue,
    currentIndex: 0,
    answers: [],
    composition,
    wordSnapshots: snapshots,
    kind: options?.kind ?? "normal",
    retryOfSessionId: options?.retryOfSessionId,
  };
}

export function addAnswerToSession(
  session: PracticeSession,
  answer: AnswerResult,
  now = Date.now(),
): PracticeSession {
  const answers = [...session.answers, answer];
  return {
    ...session,
    answers,
    currentIndex: Math.min(session.queue.length, session.currentIndex + 1),
    updatedAt: now,
  };
}

export function isSessionComplete(session: PracticeSession): boolean {
  return session.currentIndex >= session.queue.length;
}

export function buildSummary(
  session: PracticeSession,
  answerOverride?: AnswerResult[],
  now = Date.now(),
): SessionSummary {
  const answers = answerOverride ?? session.answers;
  const total = answers.length;
  const correctFirstTry = answers.filter(
    (answer) => answer.firstTryCorrect && answer.result === "correct",
  ).length;
  const wrong = answers.filter(
    (answer) =>
      answer.result === "wrong" ||
      (answer.result === "correct" && !answer.firstTryCorrect),
  ).length;
  const skipped = answers.filter((answer) => answer.result === "skipped").length;
  const durationMs = answers.reduce((sum, answer) => sum + Math.max(0, answer.durationMs), 0);
  const kana = answers.reduce((sum, answer) => sum + Math.max(0, answer.charsTyped), 0);
  const totalKeys = answers.reduce(
    (sum, answer) =>
      sum +
      Math.max(
        0,
        answer.totalKeys ??
          Math.max(0, answer.charsTyped) + Math.max(0, answer.errors),
      ),
    0,
  );
  const correctKeys = answers.reduce(
    (sum, answer) =>
      sum +
      Math.max(
        0,
        answer.correctKeys ??
          (answer.totalKeys === undefined
            ? Math.max(0, answer.charsTyped)
            : Math.max(0, answer.totalKeys - Math.max(0, answer.errors))),
      ),
    0,
  );
  let combo = 0;
  let wordMaxCombo = 0;
  for (const answer of answers) {
    if (answer.firstTryCorrect && answer.result === "correct") {
      combo += 1;
      wordMaxCombo = Math.max(wordMaxCombo, combo);
    } else {
      combo = 0;
    }
  }
  // The reference HUD counts keystrokes, not completed words. Older records
  // do not have these optional fields, so fall back to the historical
  // word-level streak instead of showing zero.
  const maxKeyCombo = answers.reduce(
    (maximum, answer) => Math.max(maximum, answer.maxKeyCombo ?? 0),
    0,
  );
  const wrongWords: string[] = [];
  for (const answer of answers) {
    if (
      (answer.result !== "correct" || !answer.firstTryCorrect) &&
      !wrongWords.includes(answer.wordKey)
    ) {
      wrongWords.push(answer.wordKey);
    }
  }
  return {
    id: session.id,
    packId: session.packId,
    packName: session.packName,
    startedAt: session.startedAt,
    endedAt: now,
    batchSize: session.batchSize,
    queueSize: session.queue.length,
    answers,
    composition: session.composition,
    total,
    correctFirstTry,
    wrong,
    skipped,
    accuracy: total > 0 ? correctFirstTry / total : 0,
    // The reference HUD starts at 100%; a skipped-only batch has no wrong key.
    typingAccuracy: totalKeys > 0 ? correctKeys / totalKeys : 1,
    totalKeys,
    correctKeys,
    durationMs,
    kanaPerMinute: durationMs > 0 ? kana / (durationMs / 60_000) : 0,
    maxCombo: Math.max(wordMaxCombo, maxKeyCombo),
    words: wrongWords,
    wordSnapshots: session.wordSnapshots,
    kind: session.kind ?? "normal",
    retryOfSessionId: session.retryOfSessionId,
  };
}

/**
 * Assigns the displayed 1-based group number to summaries.
 *
 * Normal sessions define the group order. A retry keeps the number of the
 * session it was started from, which is what the reference result screen uses
 * for "第 N 组再打一遍". Drills do not consume a group number.
 */
export function getSessionGroupNumbers(
  sessions: SessionSummary[],
  packId?: string,
): Map<string, number> {
  const normal = sessions
    .filter(
      (summary) =>
        (summary.kind ?? "normal") === "normal" &&
        (!packId || summary.packId === packId),
    )
    .sort((a, b) => a.endedAt - b.endedAt || a.id.localeCompare(b.id));
  const numbers = new Map<string, number>();
  normal.forEach((summary, index) => numbers.set(summary.id, index + 1));

  const resolve = (
    summary: SessionSummary,
    seen: Set<string>,
  ): number | undefined => {
    const known = numbers.get(summary.id);
    if (known !== undefined) return known;
    if (!summary.retryOfSessionId || seen.has(summary.id)) return undefined;
    seen.add(summary.id);
    const parent = sessions.find(
      (candidate) =>
        candidate.id === summary.retryOfSessionId &&
        candidate.packId === summary.packId,
    );
    if (!parent) return undefined;
    const resolved = resolve(parent, seen);
    if (resolved !== undefined) numbers.set(summary.id, resolved);
    return resolved;
  };

  for (const summary of sessions) resolve(summary, new Set());
  return numbers;
}

export function isDrillLikeSummary(
  sessions: SessionSummary[],
  summary: SessionSummary,
): boolean {
  const seen = new Set<string>();
  let current = summary;
  for (;;) {
    if ((current.kind ?? "normal") === "drill") return true;
    if (
      (current.kind ?? "normal") !== "retry" ||
      !current.retryOfSessionId ||
      seen.has(current.id)
    ) {
      return false;
    }
    seen.add(current.id);
    const parent = sessions.find(
      (candidate) =>
        candidate.id === current.retryOfSessionId &&
        candidate.packId === current.packId,
    );
    if (!parent) return false;
    current = parent;
  }
}

export interface PackProgress {
  total: number;
  typable: number;
  learned: number;
  due: number;
  mastered: number;
  accuracy: number;
  averageMastery: number;
  completion: number;
  nextDueAt?: number;
}

export function getPackProgress(
  pack: Pack,
  stats: Map<string, WordStat>,
  now = Date.now(),
): PackProgress {
  const seen = new Set<string>();
  let total = 0;
  let typable = 0;
  let learned = 0;
  let due = 0;
  let mastered = 0;
  let attempts = 0;
  let correctFirstTry = 0;
  let masterySum = 0;
  let masteredSeen = 0;
  let nextDue: number | undefined;

  for (const word of pack.words) {
    if (seen.has(word.key)) continue;
    seen.add(word.key);
    total += 1;
    if (!isTypableWord(word)) continue;
    typable += 1;
    const stat = stats.get(word.key);
    if (!stat || stat.attempts === 0) continue;
    learned += 1;
    attempts += stat.attempts;
    correctFirstTry += stat.correctFirstTry;
    masterySum += stat.mastery;
    masteredSeen += 1;
    if (stat.mastery >= 70) mastered += 1;
    if (stat.dueAt <= now) due += 1;
    if (stat.dueAt > now) nextDue = Math.min(nextDue ?? stat.dueAt, stat.dueAt);
  }

  return {
    total,
    typable,
    learned,
    due,
    mastered,
    accuracy: attempts > 0 ? correctFirstTry / attempts : 0,
    averageMastery: masteredSeen > 0 ? Math.round(masterySum / masteredSeen) : 0,
    completion: typable > 0 ? learned / typable : 0,
    nextDueAt: nextDue,
  };
}

export function createEmptyPlan(packId: string, now = Date.now()): PackPlan {
  return {
    packId,
    activeSession: null,
    createdAt: now,
    updatedAt: now,
    completedSessions: 0,
  };
}

export function getMaxCombo(answers: AnswerResult[]): number {
  let combo = 0;
  let max = 0;
  for (const answer of answers) {
    if (answer.firstTryCorrect && answer.result === "correct") {
      combo += 1;
      max = Math.max(max, combo);
    } else {
      combo = 0;
    }
  }
  return max;
}
