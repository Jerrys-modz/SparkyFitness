import type { ChatToolCategorySlug } from './chatToolCategories.ts';

/**
 * Coaches (#2013): a coach is Sparky with a focus. It adds its own
 * instructions to the chat and limits which tool categories the conversation
 * may use, so a coach only reaches the data its job needs.
 *
 * The built-in coaches live here and are not stored; a person's own coaches
 * are rows in the `coaches` table. Apps translate the built-in names and
 * descriptions by `key`; `prompt` is written for the model and stays English.
 */
export const BUILTIN_COACH_ID_PREFIX = 'builtin:';

export const BUILTIN_COACH_KEYS = [
  'recovery',
  'consistency',
  'macro_timing',
  'sleep_recovery',
] as const;

export type BuiltinCoachKey = (typeof BUILTIN_COACH_KEYS)[number];

export interface BuiltinCoach {
  /** What a chat request sends as `coachId`, e.g. `builtin:recovery`. */
  id: string;
  key: BuiltinCoachKey;
  prompt: string;
  toolCategories: readonly ChatToolCategorySlug[];
}

const SHARED_RULES =
  'Work from the logged data you can read with your tools, say which numbers you used, and say so plainly when the data needed is missing. Offer one or two concrete next steps at most. Be encouraging and never guilt the user. You are not a medical professional: for pain, injury or illness, suggest seeing one.';

const builtin = (
  key: BuiltinCoachKey,
  toolCategories: readonly ChatToolCategorySlug[],
  focus: string
): BuiltinCoach => ({
  id: `${BUILTIN_COACH_ID_PREFIX}${key}`,
  key,
  toolCategories,
  prompt: `${focus} ${SHARED_RULES}`,
});

export const BUILTIN_COACHES: readonly BuiltinCoach[] = [
  builtin(
    'recovery',
    ['exercise', 'food', 'checkin', 'goals', 'reports', 'coaching'],
    'You are the Recovery Coach. You connect training with nutrition and rest: look at recent workouts next to what was eaten around them, and at sleep where it is logged. After a hard session, check whether protein and total energy that day and the next support recovery, and point out what neither log shows on its own.'
  ),
  builtin(
    'consistency',
    ['food', 'exercise', 'checkin', 'coaching'],
    'You are the Consistency Coach. You care about habits more than perfect days: notice logging streaks and gaps, celebrate what was kept up, and help restart after a gap with the smallest useful step. A missed day is information, never a failure.'
  ),
  builtin(
    'macro_timing',
    ['food', 'exercise', 'goals'],
    'You are the Macro Timing Coach. You look at when protein, carbohydrate and total energy are eaten relative to workouts and across the day, against the goals the user set. Suggest simple shifts in timing or portion using foods the user already logs.'
  ),
  builtin(
    'sleep_recovery',
    ['checkin', 'exercise', 'reports', 'coaching'],
    'You are the Sleep and Recovery Coach. You compare sleep with training load: how nights before and after hard sessions looked, sleep debt, and readiness where it is available. Help the user decide when to push and when to ease off.'
  ),
];

export function isBuiltinCoachId(id: string): boolean {
  return id.startsWith(BUILTIN_COACH_ID_PREFIX);
}

export function findBuiltinCoach(id: string): BuiltinCoach | undefined {
  return BUILTIN_COACHES.find((coach) => coach.id === id);
}

/** The most coaches of their own a person can keep. */
export const CUSTOM_COACHES_MAX = 20;
export const COACH_NAME_MAX_LENGTH = 60;
export const COACH_DESCRIPTION_MAX_LENGTH = 200;
export const COACH_PROMPT_MAX_LENGTH = 4000;
