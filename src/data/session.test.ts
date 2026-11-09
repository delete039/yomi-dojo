import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "./settings";
import {
  buildSummary,
  createPracticeSession,
  getPackProgress,
  getSessionGroupNumbers,
  isDrillLikeSummary,
  planQueue,
} from "./session";
import type {
  AnswerResult,
  Pack,
  PackWord,
  SessionSummary,
  WordStat,
} from "./types";
import { applyAnswer } from "./srs";

const HOUR = 3_600_000;
const DAY = 86_400_000;
const NOW = new Date("2026-11-08T12:00:00+08:00").getTime();

function makeWord(index: number): PackWord {
  const characters = ["肝心", "円滑", "還元", "潔い", "合併", "克明", "遂行", "寛容"];
  const readings = ["かんじん", "えんかつ", "かんげん", "いさぎよい", "ごうべい", "こくめい", "すいこう", "かんよう"];
  return {
    key: `${characters[index]}|${readings[index]}`,
    word: characters[index],
    reading: readings[index],
    meaning: `释义 ${index}`,
    jlpt: "N1",
    hasKanji: true,
    addedAt: NOW - 30 * DAY,
  };
}

function makePack(count = 8): Pack {
  return {
    id: "pack-test",
    name: "测试词包",
    description: "",
    kind: "custom",
    words: Array.from({ length: count }, (_, index) => makeWord(index)),
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function statFor(word: PackWord, overrides: Partial<WordStat> = {}): WordStat {
  return {
    ...applyAnswer(undefined, word, {
      wordKey: word.key,
      mode: "new",
      result: "correct",
      firstTryCorrect: true,
      errors: 0,
      hintUsed: false,
      skipped: false,
      durationMs: 2_000,
      charsTyped: 4,
      answeredAt: NOW - DAY,
    }, NOW - DAY),
    ...overrides,
  };
}

describe("dynamic batch planning", () => {
  it("puts due reviews before new words and fills remaining slots", () => {
    const pack = makePack(6);
    const dueWord = pack.words[0];
    const futureWord = pack.words[1];
    const stats = new Map<string, WordStat>([
      [dueWord.key, statFor(dueWord, { dueAt: NOW - HOUR, mastery: 25 })],
      [futureWord.key, statFor(futureWord, { dueAt: NOW + 4 * DAY, mastery: 88 })],
    ]);
    const planned = planQueue(pack, stats, { ...DEFAULT_SETTINGS, batchSize: 5 }, NOW);
    expect(planned.queue).toHaveLength(5);
    expect(planned.queue[0].key).toBe(dueWord.key);
    expect(planned.queue[0].mode).toBe("review");
    expect(planned.queue.filter((item) => item.mode === "new")).toHaveLength(4);
    expect(planned.composition.review).toBe(1);
    expect(planned.composition.new).toBe(4);
  });

  it("respects the daily new-word limit", () => {
    const pack = makePack(4);
    const stats = new Map<string, WordStat>();
    const plan = planQueue(
      pack,
      stats,
      { ...DEFAULT_SETTINGS, batchSize: 3, dailyNewLimit: 1 },
      NOW,
    );
    expect(plan.queue).toHaveLength(1);
    expect(plan.queue[0].mode).toBe("new");
    expect(plan.limitedByNewLimit).toBe(false);

    const used = statFor(pack.words[0], { attempts: 1, firstSeenAt: NOW - HOUR });
    const limited = planQueue(
      pack,
      new Map([[used.key, used]]),
      { ...DEFAULT_SETTINGS, batchSize: 3, dailyNewLimit: 1 },
      NOW,
    );
    expect(limited.queue).toHaveLength(1);
    expect(limited.limitedByNewLimit).toBe(false);
  });

  it("uses weak future words only to fill empty slots", () => {
    const pack = makePack(3);
    const stats = new Map<string, WordStat>([
      [
        pack.words[0].key,
        statFor(pack.words[0], { dueAt: NOW + 2 * DAY, mastery: 12 }),
      ],
      [
        pack.words[1].key,
        statFor(pack.words[1], { dueAt: NOW + 8 * DAY, mastery: 95 }),
      ],
    ]);
    const plan = planQueue(pack, stats, { ...DEFAULT_SETTINGS, batchSize: 3 }, NOW);
    expect(plan.queue).toHaveLength(3);
    expect(plan.queue.filter((item) => item.mode === "reinforce")).toHaveLength(2);
    expect(plan.queue.find((item) => item.mode === "reinforce")?.key).toBe(
      pack.words[0].key,
    );
  });

  it("creates an explicit drill queue", () => {
    const pack = makePack(4);
    const plan = planQueue(
      pack,
      new Map(),
      DEFAULT_SETTINGS,
      NOW,
      { forceKeys: [pack.words[1].key, pack.words[3].key] },
    );
    expect(plan.queue).toHaveLength(2);
    expect(plan.queue.map((item) => item.key)).toEqual([
      pack.words[1].key,
      pack.words[3].key,
    ]);
    expect(plan.queue.every((item) => item.mode === "relearn")).toBe(true);
  });

  it("keeps the caller's order for a shuffled weak-word drill", () => {
    const pack = makePack(5);
    const requested = [
      pack.words[4].key,
      pack.words[0].key,
      pack.words[2].key,
      pack.words[0].key,
    ];
    const plan = planQueue(
      pack,
      new Map(),
      DEFAULT_SETTINGS,
      NOW,
      { forceKeys: requested },
    );

    expect(plan.queue.map((item) => item.key)).toEqual([
      pack.words[4].key,
      pack.words[0].key,
      pack.words[2].key,
    ]);
  });

  it("uses one typable definition for progress and queue planning", () => {
    const pack = makePack(2);
    pack.words[1] = {
      ...pack.words[1],
      reading: "   ",
    };

    const progress = getPackProgress(pack, new Map(), NOW);
    const plan = planQueue(
      pack,
      new Map(),
      { ...DEFAULT_SETTINGS, batchSize: 20, dailyNewLimit: 0 },
      NOW,
    );

    expect(progress.typable).toBe(1);
    expect(plan.queue).toHaveLength(1);
    expect(plan.queue[0].key).toBe(pack.words[0].key);
    expect(plan.missingTypableWords).toBe(1);
  });

  it("ignores malformed legacy readings instead of crashing", () => {
    for (const malformed of [undefined, 123, null]) {
      const pack = makePack(2);
      pack.words[1] = {
        ...pack.words[1],
        reading: malformed as unknown as string,
      };

      expect(() => getPackProgress(pack, new Map(), NOW)).not.toThrow();
      expect(getPackProgress(pack, new Map(), NOW).typable).toBe(1);
      expect(
        planQueue(
          pack,
          new Map(),
          { ...DEFAULT_SETTINGS, batchSize: 20, dailyNewLimit: 0 },
          NOW,
        ).queue,
      ).toHaveLength(1);
    }
  });
});

describe("session summaries and progress", () => {
  it("summarizes first-try accuracy, errors, skips and weak words", () => {
    const pack = makePack();
    const [a, b, c] = pack.words;
    const answers: AnswerResult[] = [
      {
        wordKey: a.key,
        mode: "new",
        result: "correct",
        firstTryCorrect: true,
        errors: 0,
        hintUsed: false,
        skipped: false,
        durationMs: 2_000,
        charsTyped: 4,
        answeredAt: NOW,
      },
      {
        wordKey: b.key,
        mode: "new",
        result: "correct",
        firstTryCorrect: false,
        errors: 2,
        hintUsed: false,
        skipped: false,
        durationMs: 4_000,
        charsTyped: 4,
        answeredAt: NOW + 4_000,
      },
      {
        wordKey: c.key,
        mode: "new",
        result: "skipped",
        firstTryCorrect: false,
        errors: 0,
        hintUsed: false,
        skipped: true,
        durationMs: 1_000,
        charsTyped: 0,
        answeredAt: NOW + 5_000,
      },
    ];
    const session = createPracticeSession(pack, answers.map((entry) => ({
      key: entry.wordKey,
      mode: entry.mode,
      reason: "测试",
    })), { new: 3, review: 0, reinforce: 0, relearn: 0 }, NOW);
    const summary = buildSummary(
      {
        ...session,
        answers,
        currentIndex: 3,
      },
      undefined,
      NOW + 5_000,
    );
    expect(summary.total).toBe(3);
    expect(summary.correctFirstTry).toBe(1);
    expect(summary.accuracy).toBeCloseTo(1 / 3);
    expect(summary.wrong).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.words).toEqual([b.key, c.key]);
    expect(summary.maxCombo).toBe(1);
    expect(summary.kanaPerMinute).toBeGreaterThan(0);
    expect(summary.wordSnapshots?.[a.key]).toMatchObject({
      word: a.word,
      reading: a.reading,
      meaning: a.meaning,
    });
  });

  it("calculates pack progress and mastery thresholds", () => {
    const pack = makePack(4);
    const stats = new Map<string, WordStat>([
      [
        pack.words[0].key,
        statFor(pack.words[0], {
          attempts: 4,
          correctFirstTry: 4,
          mastery: 75,
          dueAt: NOW - HOUR,
        }),
      ],
      [
        pack.words[1].key,
        statFor(pack.words[1], {
          attempts: 4,
          correctFirstTry: 1,
          mastery: 30,
          dueAt: NOW + DAY,
        }),
      ],
    ]);
    const progress = getPackProgress(pack, stats, NOW);
    expect(progress.total).toBe(4);
    expect(progress.typable).toBe(4);
    expect(progress.learned).toBe(2);
    expect(progress.mastered).toBe(1);
    expect(progress.due).toBe(1);
    expect(progress.completion).toBe(0.5);
    expect(progress.nextDueAt).toBe(NOW + DAY);
  });

  it("keeps a retry on its original group number", () => {
    const base = {
      packId: "pack-test",
      packName: "测试",
      startedAt: NOW,
      endedAt: NOW,
      batchSize: 1,
      queueSize: 1,
      answers: [],
      composition: { new: 0, review: 0, reinforce: 0, relearn: 0 },
      total: 0,
      correctFirstTry: 0,
      wrong: 0,
      skipped: 0,
      accuracy: 0,
      durationMs: 1_000,
      kanaPerMinute: 0,
      maxCombo: 0,
      words: [],
    } satisfies Omit<SessionSummary, "id" | "kind">;
    const sessions: SessionSummary[] = [
      { ...base, id: "a", endedAt: NOW, kind: "normal" },
      { ...base, id: "b", endedAt: NOW + 1, kind: "normal" },
      {
        ...base,
        id: "retry-a",
        endedAt: NOW + 2,
        kind: "retry",
        retryOfSessionId: "a",
      },
      {
        ...base,
        id: "retry-a-2",
        endedAt: NOW + 3,
        kind: "retry",
        retryOfSessionId: "retry-a",
      },
      { ...base, id: "drill", endedAt: NOW + 4, kind: "drill" },
      {
        ...base,
        id: "retry-drill",
        endedAt: NOW + 5,
        kind: "retry",
        retryOfSessionId: "drill",
      },
      {
        ...base,
        id: "retry-drill-2",
        endedAt: NOW + 6,
        kind: "retry",
        retryOfSessionId: "retry-drill",
      },
      {
        ...base,
        id: "cross-pack-retry",
        packId: "pack-other",
        endedAt: NOW + 7,
        kind: "retry",
        retryOfSessionId: "a",
      },
    ];
    const numbers = getSessionGroupNumbers(sessions);
    expect(numbers.get("a")).toBe(1);
    expect(numbers.get("b")).toBe(2);
    expect(numbers.get("retry-a")).toBe(1);
    expect(numbers.get("retry-a-2")).toBe(1);
    expect(numbers.has("drill")).toBe(false);
    expect(numbers.has("retry-drill")).toBe(false);
    expect(numbers.has("retry-drill-2")).toBe(false);
    expect(numbers.has("cross-pack-retry")).toBe(false);

    const byId = new Map(sessions.map((summary) => [summary.id, summary]));
    expect(isDrillLikeSummary(sessions, byId.get("retry-a")!)).toBe(false);
    expect(isDrillLikeSummary(sessions, byId.get("drill")!)).toBe(true);
    expect(isDrillLikeSummary(sessions, byId.get("retry-drill")!)).toBe(true);
    expect(isDrillLikeSummary(sessions, byId.get("retry-drill-2")!)).toBe(true);
    expect(
      isDrillLikeSummary(sessions, byId.get("cross-pack-retry")!),
    ).toBe(false);
  });

  it("numbers groups independently for each pack", () => {
    const base = {
      packName: "测试",
      startedAt: NOW,
      endedAt: NOW,
      batchSize: 1,
      queueSize: 1,
      answers: [],
      composition: { new: 0, review: 0, reinforce: 0, relearn: 0 },
      total: 0,
      correctFirstTry: 0,
      wrong: 0,
      skipped: 0,
      accuracy: 0,
      durationMs: 1_000,
      kanaPerMinute: 0,
      maxCombo: 0,
      words: [],
      kind: "normal" as const,
    };
    const sessions: SessionSummary[] = [
      { ...base, id: "a-1", packId: "pack-a", endedAt: NOW + 1 },
      { ...base, id: "b-1", packId: "pack-b", endedAt: NOW + 2 },
      { ...base, id: "a-2", packId: "pack-a", endedAt: NOW + 3 },
    ];

    const packA = getSessionGroupNumbers(sessions, "pack-a");
    const packB = getSessionGroupNumbers(sessions, "pack-b");
    expect(packA.get("a-1")).toBe(1);
    expect(packA.get("a-2")).toBe(2);
    expect(packB.get("b-1")).toBe(1);
  });
});
