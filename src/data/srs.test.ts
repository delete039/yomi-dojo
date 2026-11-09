import { describe, expect, it } from "vitest";
import { applyAnswer, deriveGrade, masteryBand } from "./srs";
import type { AnswerResult, PackWord } from "./types";

const DAY = 86_400_000;

const word: PackWord = {
  key: "肝心|かんじん",
  word: "肝心",
  reading: "かんじん",
  meaning: "关键",
  jlpt: "N1",
  hasKanji: true,
  addedAt: 1,
};

function answer(overrides: Partial<AnswerResult> = {}): AnswerResult {
  return {
    wordKey: word.key,
    mode: "new",
    result: "correct",
    firstTryCorrect: true,
    errors: 0,
    hintUsed: false,
    skipped: false,
    durationMs: 2_000,
    charsTyped: 4,
    answeredAt: 1_000,
    ...overrides,
  };
}

describe("SRS record updates", () => {
  it("rewards a clean first-try answer", () => {
    const stat = applyAnswer(undefined, word, answer(), 1_000);
    expect(stat.attempts).toBe(1);
    expect(stat.correctFirstTry).toBe(1);
    expect(stat.errorRate).toBe(0);
    expect(stat.streak).toBe(1);
    expect(stat.dueAt).toBeGreaterThan(1_000);
    expect(stat.mastery).toBeGreaterThanOrEqual(0);
  });

  it("counts hints as non-first-try attempts", () => {
    const stat = applyAnswer(
      undefined,
      word,
      answer({ hintUsed: true, firstTryCorrect: false }),
      1_000,
    );
    expect(stat.correctFirstTry).toBe(0);
    expect(stat.wrong).toBe(1);
    expect(stat.errorRate).toBe(1);
    expect(stat.streak).toBe(0);
    expect(deriveGrade(answer({ hintUsed: true, firstTryCorrect: false }))).toBe(1);
  });

  it("schedules skips sooner than clean answers", () => {
    const skipped = applyAnswer(
      undefined,
      word,
      answer({ result: "skipped", skipped: true, firstTryCorrect: false }),
      1_000,
    );
    const clean = applyAnswer(undefined, word, answer(), 1_000);
    expect(skipped.dueAt).toBeLessThan(clean.dueAt);
    expect(skipped.skipped).toBe(1);
  });

  it("decays stability and increases lapses after a lapse", () => {
    const first = applyAnswer(undefined, word, answer(), 1_000);
    const second = applyAnswer(
      first,
      word,
      answer({
        answeredAt: 1_000 + DAY,
        result: "wrong",
        firstTryCorrect: false,
        errors: 2,
      }),
      1_000 + DAY,
    );
    expect(second.lapses).toBe(first.lapses + 1);
    expect(second.stability).toBeLessThan(first.stability);
    expect(second.attempts).toBe(2);
    expect(second.errorRate).toBe(0.5);
  });

  it("maps mastery bands consistently", () => {
    expect(masteryBand(undefined)).toBe("new");
    expect(
      masteryBand({
        ...applyAnswer(undefined, word, answer(), 1_000),
        attempts: 1,
        mastery: 35,
      }),
    ).toBe("learning");
    expect(
      masteryBand({
        ...applyAnswer(undefined, word, answer(), 1_000),
        attempts: 1,
        mastery: 70,
      }),
    ).toBe("mastered");
    expect(
      masteryBand({
        ...applyAnswer(undefined, word, answer(), 1_000),
        attempts: 1,
        mastery: 92,
      }),
    ).toBe("stable");
  });
});
