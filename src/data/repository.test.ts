import { describe, expect, it } from "vitest";
import { assertBackup } from "./repository";
import type { BackupData } from "./types";

function validBackup(): BackupData {
  return {
    format: "yomidojo-backup",
    version: 1,
    appVersion: "1.0.0",
    exportedAt: new Date(0).toISOString(),
    settings: {
      batchSize: 20,
      dailyNewLimit: 0,
      dailyGoal: 20,
      showReading: false,
      romajiInput: true,
      kanaInput: true,
      keySound: true,
      speakAfterComplete: false,
      autoAdvance: true,
    },
    packs: [
      {
        id: "pack-a",
        name: "A",
        description: "",
        kind: "custom",
        words: [
          {
            key: "肝心|かんじん",
            word: "肝心",
            reading: "かんじん",
            meaning: "关键",
            jlpt: "N1",
            hasKanji: true,
            addedAt: 1,
          },
        ],
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    plans: [
      {
        packId: "pack-a",
        activeSession: null,
        createdAt: 1,
        updatedAt: 1,
        completedSessions: 0,
      },
    ],
    wordStats: [],
    sessions: [],
  };
}

describe("backup validation", () => {
  it("accepts the current backup schema", () => {
    expect(() => assertBackup(validBackup())).not.toThrow();
  });

  it("rejects duplicate pack ids", () => {
    const backup = validBackup();
    backup.packs.push({ ...backup.packs[0] });
    expect(() => assertBackup(backup)).toThrow("重复的词包标识");
  });

  it("rejects a corrupted unfinished session", () => {
    const backup = validBackup();
    backup.plans[0].activeSession = {
      id: "broken",
      packId: "other-pack",
      packName: "A",
      startedAt: 1,
      updatedAt: 1,
      batchSize: 1,
      queue: [],
      currentIndex: 0,
      answers: [],
      composition: { new: 0, review: 0, reinforce: 0, relearn: 0 },
    };
    expect(() => assertBackup(backup)).toThrow("损坏的未完成练习");
  });

  it("rejects duplicate vocabulary records", () => {
    const backup = validBackup();
    const stat = {
      key: "肝心|かんじん",
      word: "肝心",
      reading: "かんじん",
      meaning: "关键",
      attempts: 1,
      correctFirstTry: 1,
      wrong: 0,
      skipped: 0,
      mistakes: 0,
      errorRate: 0,
      accuracy: 1,
      totalMs: 1_000,
      charsTyped: 4,
      streak: 1,
      bestStreak: 1,
      stability: 1,
      difficulty: 5,
      mastery: 10,
      lapses: 0,
      firstSeenAt: 1,
      lastReviewedAt: 1,
      dueAt: 2,
      lastResult: "correct" as const,
      history: [],
    };
    backup.wordStats.push(stat, { ...stat });
    expect(() => assertBackup(backup)).toThrow("重复的词汇记录");
  });
});
