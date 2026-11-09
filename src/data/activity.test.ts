import { describe, expect, it } from "vitest";
import { collectAnswerActivity } from "./activity";
import type {
  AnswerResult,
  PackPlan,
  SessionSummary,
} from "./types";

function answer(answeredAt: number, wordKey: string): AnswerResult {
  return {
    wordKey,
    mode: "new",
    result: "correct",
    firstTryCorrect: true,
    errors: 0,
    hintUsed: false,
    skipped: false,
    durationMs: 1_000,
    charsTyped: 3,
    answeredAt,
  };
}

const plan = {
  packId: "pack-a",
  activeSession: {
    id: "active",
    packId: "pack-a",
    packName: "A",
    startedAt: 1,
    updatedAt: 1,
    batchSize: 2,
    queue: [],
    currentIndex: 1,
    answers: [answer(30, "active-word")],
    composition: { new: 1, review: 0, reinforce: 0, relearn: 0 },
  },
  createdAt: 1,
  updatedAt: 1,
  completedSessions: 0,
} satisfies PackPlan;

const session = {
  id: "done",
  packId: "pack-a",
  packName: "A",
  startedAt: 1,
  endedAt: 20,
  batchSize: 1,
  queueSize: 1,
  answers: [answer(10, "done-word")],
  composition: { new: 1, review: 0, reinforce: 0, relearn: 0 },
  total: 1,
  correctFirstTry: 1,
  wrong: 0,
  skipped: 0,
  accuracy: 1,
  durationMs: 1_000,
  kanaPerMinute: 180,
  maxCombo: 1,
  words: [],
} satisfies SessionSummary;

describe("answer activity", () => {
  it("merges completed and unfinished answers in chronological order", () => {
    expect(
      collectAnswerActivity([session], [plan]).map((item) => item.wordKey),
    ).toEqual(["done-word", "active-word"]);
  });
});
