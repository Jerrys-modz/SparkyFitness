import type { BuiltinCoachKey } from '../constants/coaches.ts';
import { addDays } from './timezone.ts';

/**
 * When a coach speaks up on its own (#2013). These rules decide *whether*
 * there is something worth saying; wording is left to the apps (a translated
 * template built from `facts`) or, when the person asked for it, to their AI
 * service. Everything here is pure: the server gathers the facts and both the
 * scheduled check-in and the chat tools read the same rules.
 *
 * The rules look at finished days (yesterday and before), never at a day
 * still in progress, and treat something that was not logged as unknown
 * rather than zero.
 */
export const COACH_TRIGGER_TYPES = [
  'low_protein_after_training',
  'short_sleep_under_load',
  'logging_gap',
  'streak_milestone',
] as const;

export type CoachTriggerType = (typeof COACH_TRIGGER_TYPES)[number];

/** Which built-in coach raises each trigger. */
export const COACH_TRIGGER_COACH: Record<CoachTriggerType, BuiltinCoachKey> = {
  low_protein_after_training: 'recovery',
  short_sleep_under_load: 'sleep_recovery',
  logging_gap: 'consistency',
  streak_milestone: 'consistency',
};

/** The built-in coaches that can check in on their own. */
export const CHECKIN_COACH_KEYS: readonly BuiltinCoachKey[] = [
  'recovery',
  'sleep_recovery',
  'consistency',
];

/** Protein below this share of the goal counts as low after a training day. */
export const LOW_PROTEIN_GOAL_SHARE = 0.8;
/** A night shorter than this, with recent training, is worth a word. */
export const SHORT_SLEEP_HOURS = 6;
export const SHORT_SLEEP_MIN_WORKOUTS = 2;
/** Days without logging at which the consistency coach says something. */
export const LOGGING_GAP_NUDGE_DAYS: readonly number[] = [2, 5];
export const STREAK_MILESTONES: readonly number[] = [
  3, 7, 14, 30, 60, 100, 200, 365,
];
/** The most check-in messages a person gets on one day, across coaches. */
export const COACH_CHECKINS_MAX_PER_DAY = 2;

export interface CoachTriggerFacts {
  /** The person's calendar day (YYYY-MM-DD). */
  today: string;
  /** Distinct days with any logged food, exercise or check-in, newest first. */
  loggedDays: readonly string[];
  yesterday: {
    foodEntries: number;
    proteinGrams: number;
    workouts: number;
  };
  /** The daily protein goal in grams, or null when none is set. */
  proteinGoalGrams: number | null;
  /** Hours of the most recent night's main sleep, or null when not logged. */
  lastNightSleepHours: number | null;
  /** Logged workouts on the three days before today. */
  workoutsLast3Days: number;
}

export interface CoachTrigger {
  type: CoachTriggerType;
  coachKey: BuiltinCoachKey;
  /** The numbers behind the trigger, for the message template. */
  facts: Record<string, number>;
}

const MS_PER_DAY = 86_400_000;

function daysBetween(from: string, to: string): number {
  // Day strings parse as UTC midnight, so the difference is exact.
  return Math.round((Date.parse(to) - Date.parse(from)) / MS_PER_DAY);
}

/**
 * Consecutive logged days ending on `today`, or on yesterday when nothing is
 * logged today yet. `days` are distinct day strings, newest first.
 */
export function computeLoggingStreak(
  days: readonly string[],
  today: string
): number {
  if (days.length === 0) return 0;
  if (days[0] !== today && days[0] !== addDays(today, -1)) return 0;
  let streak = 1;
  for (let i = 1; i < days.length && days[i] === addDays(days[0], -i); i++) {
    streak++;
  }
  return streak;
}

/** Every trigger the facts support, most useful first. */
export function evaluateCoachTriggers(
  facts: CoachTriggerFacts
): CoachTrigger[] {
  const triggers: CoachTrigger[] = [];
  const yesterday = addDays(facts.today, -1);

  // Recovery: trained yesterday, logged food, and protein was well short.
  if (
    facts.yesterday.workouts > 0 &&
    facts.yesterday.foodEntries > 0 &&
    facts.proteinGoalGrams !== null &&
    facts.proteinGoalGrams > 0 &&
    facts.yesterday.proteinGrams <
      facts.proteinGoalGrams * LOW_PROTEIN_GOAL_SHARE
  ) {
    triggers.push({
      type: 'low_protein_after_training',
      coachKey: 'recovery',
      facts: {
        protein: Math.round(facts.yesterday.proteinGrams),
        goal: Math.round(facts.proteinGoalGrams),
      },
    });
  }

  // Sleep and recovery: a short night on top of recent training.
  if (
    facts.lastNightSleepHours !== null &&
    facts.lastNightSleepHours > 0 &&
    facts.lastNightSleepHours < SHORT_SLEEP_HOURS &&
    facts.workoutsLast3Days >= SHORT_SLEEP_MIN_WORKOUTS
  ) {
    triggers.push({
      type: 'short_sleep_under_load',
      coachKey: 'sleep_recovery',
      facts: {
        hours: Math.round(facts.lastNightSleepHours * 10) / 10,
        workouts: facts.workoutsLast3Days,
      },
    });
  }

  // Consistency: a gentle word early in a gap, then silence.
  const lastLogged = facts.loggedDays[0];
  if (lastLogged) {
    const gap = daysBetween(lastLogged, facts.today);
    if (LOGGING_GAP_NUDGE_DAYS.includes(gap)) {
      triggers.push({
        type: 'logging_gap',
        coachKey: 'consistency',
        facts: { days: gap },
      });
    }
  }

  // Consistency: a streak of finished days that just reached a milestone.
  const finishedDays = facts.loggedDays.filter((day) => day !== facts.today);
  const streak = computeLoggingStreak(finishedDays, yesterday);
  if (finishedDays[0] === yesterday && STREAK_MILESTONES.includes(streak)) {
    triggers.push({
      type: 'streak_milestone',
      coachKey: 'consistency',
      facts: { days: streak },
    });
  }

  return triggers;
}
