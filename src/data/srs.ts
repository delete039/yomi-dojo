import { clamp } from "../lib/utils";
import type { AnswerResult, PackWord, WordStat } from "./types";

const DAY = 86_400_000;
const HOUR = 3_600_000;

export type ReviewGrade = 0 | 1 | 2 | 3;

export function deriveGrade(answer: AnswerResult): ReviewGrade {
  if (answer.result === "skipped") return 0;
  if (!answer.firstTryCorrect || answer.errors > 0 || answer.hintUsed) return 1;
  const perCharMs = answer.charsTyped > 0 ? answer.durationMs / answer.charsTyped : 3_000;
  return perCharMs <= 1_500 ? 3 : 2;
}

function initialStability(grade: ReviewGrade): number {
  return [0.25, 0.8, 2, 3.5][grade];
}

function initialDifficulty(grade: ReviewGrade): number {
  return [7.5, 6.5, 5, 4][grade];
}

function calculateMastery(
  stability: number,
  attempts: number,
  correctFirstTry: number,
): number {
  if (attempts === 0) return 0;
  const stabilityScore = clamp(Math.log1p(stability) / Math.log1p(180), 0, 1);
  const retentionScore = clamp(correctFirstTry / attempts, 0, 1);
  const experienceScore = clamp(attempts / 6, 0, 1);
  return Math.round(
    100 * (0.38 * stabilityScore + 0.32 * retentionScore + 0.3 * experienceScore),
  );
}

/**
 * Apply one completed typing answer to a word's long-term record.
 *
 * This is deliberately small and deterministic, inspired by FSRS/SM-2:
 * stability grows after unaided recall, drops after a lapse, and difficulty
 * nudges the growth rate. It is not a trained FSRS parameter set.
 */
export function applyAnswer(
  existing: WordStat | undefined,
  word: Pick<PackWord, "key" | "word" | "reading" | "meaning">,
  answer: AnswerResult,
  now = Date.now(),
): WordStat {
  const grade = deriveGrade(answer);
  const previousStability = existing?.stability ?? 0;
  const previousDifficulty = existing?.difficulty ?? initialDifficulty(grade);
  const isFirst = !existing || existing.attempts === 0;
  let stability = isFirst ? initialStability(grade) : previousStability;
  let difficulty = isFirst ? initialDifficulty(grade) : previousDifficulty;
  let lapses = existing?.lapses ?? 0;

  if (!isFirst) {
    if (grade === 0) {
      stability = Math.max(0.2, previousStability * 0.2);
      difficulty += 1.1;
      lapses += 1;
    } else if (grade === 1) {
      stability = Math.max(0.45, previousStability * 0.45);
      difficulty += 0.65;
      lapses += 1;
    } else {
      const ease = grade === 3 ? 2.15 : 1.55;
      const difficultyBonus = 0.055 * (10 - difficulty);
      stability = previousStability * (ease + difficultyBonus);
      difficulty -= grade === 3 ? 0.18 : 0.04;
    }
  }

  stability = clamp(stability, 0.2, 365);
  difficulty = clamp(difficulty, 1, 10);

  const dueAt =
    grade === 0
      ? now + 4 * HOUR
      : grade === 1
        ? now + 18 * HOUR
        : now + Math.max(1, stability) * DAY;

  const attempts = (existing?.attempts ?? 0) + 1;
  const firstTry = answer.firstTryCorrect && answer.result === "correct";
  const correctFirstTry = (existing?.correctFirstTry ?? 0) + (firstTry ? 1 : 0);
  const wrong =
    (existing?.wrong ?? 0) +
    (answer.result === "wrong" ||
    (answer.result === "correct" && !answer.firstTryCorrect)
      ? 1
      : 0);
  const skipped = (existing?.skipped ?? 0) + (answer.result === "skipped" ? 1 : 0);
  const mistakes = (existing?.mistakes ?? 0) + answer.errors;
  const streak = firstTry ? (existing?.streak ?? 0) + 1 : 0;
  const history = [
    ...(existing?.history ?? []),
    {
      at: answer.answeredAt,
      result: answer.result,
      mode: answer.mode,
      durationMs: answer.durationMs,
      errors: answer.errors,
      hintUsed: answer.hintUsed,
    },
  ].slice(-40);

  return {
    key: word.key,
    word: word.word,
    reading: word.reading,
    meaning: word.meaning,
    attempts,
    correctFirstTry,
    wrong,
    skipped,
    mistakes,
    // Error rate is the share of attempts that needed an error correction,
    // a hint, or a skip. This is more useful than only counting terminal fails.
    errorRate: attempts > 0 ? (attempts - correctFirstTry) / attempts : 0,
    accuracy: attempts > 0 ? correctFirstTry / attempts : 0,
    totalMs: (existing?.totalMs ?? 0) + Math.max(0, answer.durationMs),
    charsTyped: (existing?.charsTyped ?? 0) + Math.max(0, answer.charsTyped),
    streak,
    bestStreak: Math.max(existing?.bestStreak ?? 0, streak),
    stability,
    difficulty,
    mastery: calculateMastery(stability, attempts, correctFirstTry),
    lapses,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastReviewedAt: now,
    dueAt,
    lastResult: answer.result,
    history,
  };
}

export type MasteryBand = "new" | "learning" | "familiar" | "mastered" | "stable";

export function masteryBand(stat: WordStat | undefined): MasteryBand {
  if (!stat || stat.attempts === 0) return "new";
  if (stat.mastery >= 90) return "stable";
  if (stat.mastery >= 70) return "mastered";
  if (stat.mastery >= 40) return "familiar";
  return "learning";
}

export const MASTERY_LABELS: Record<MasteryBand, string> = {
  new: "未学",
  learning: "学习中",
  familiar: "渐熟",
  mastered: "已掌握",
  stable: "长期稳定",
};

export function isDue(stat: WordStat | undefined, now = Date.now()): boolean {
  return Boolean(stat && stat.attempts > 0 && stat.dueAt <= now);
}
