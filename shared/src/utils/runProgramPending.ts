import type {
  RunProgramCompletion,
  RunProgramEffort,
} from "../schemas/api/RunProgram.api.zod.ts";

/** How long after a workout the person is still asked how hard it felt. */
export const EFFORT_PROMPT_HOURS = 48;

/**
 * The most recent program workout that has not been rated yet, if it was done
 * recently enough to still ask about. A run from the watch can finish while
 * the phone is in a pocket, so the question is asked from the Diary too, not
 * only on the summary screen. Null when the latest workout is rated or old.
 */
export function pendingEffortRating(
  completions: readonly RunProgramCompletion[],
  efforts: readonly RunProgramEffort[],
  nowMs: number,
): RunProgramCompletion | null {
  const latest = completions.at(-1);
  if (!latest) return null;
  if (efforts.some((effort) => effort.index === latest.index)) return null;
  const doneAt = Date.parse(latest.at);
  if (!Number.isFinite(doneAt)) return null;
  if (nowMs - doneAt > EFFORT_PROMPT_HOURS * 3_600_000) return null;
  return latest;
}
