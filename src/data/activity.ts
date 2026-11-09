import type {
  AnswerResult,
  PackPlan,
  SessionSummary,
} from "./types";

/**
 * Completed sessions plus answers already saved in unfinished batches.
 * This keeps today's goal, streak and charts consistent while a batch is
 * still in progress.
 */
export function collectAnswerActivity(
  sessions: SessionSummary[],
  plans: PackPlan[],
): AnswerResult[] {
  return [
    ...sessions.flatMap((session) => session.answers),
    ...plans.flatMap((plan) => plan.activeSession?.answers ?? []),
  ].sort((a, b) => a.answeredAt - b.answeredAt);
}
