import { addDays, compareDays, daysBetween } from './timezone.ts';
import type { DietPhaseType } from '../schemas/database/DietPhases.zod.ts';

// Diet phases: a dated plan such as cut -> maintain -> cut. Each phase decides
// the Goal Mode (always the weekly weight change mode) and its rate for the
// days it covers. Days outside every phase keep the person's own Goal Mode
// setting, so a person without phases sees exactly what they saw before.

/** The fields a person sets on a phase. */
export interface DietPhasePlan {
  phase_type: DietPhaseType;
  /** Magnitude in kg/week; the sign comes from `phase_type`. */
  weekly_change_kg: number;
  start_date: string;
  end_date: string | null;
  duration_weeks: number | null;
  target_weight_kg: number | null;
}

/** A stored phase: the plan plus the day its weight target was reached. */
export interface DietPhaseLike extends DietPhasePlan {
  target_reached_on: string | null;
}

/** Days before an upcoming change when clients show the "changes soon" notice. */
export const DIET_PHASE_CHANGE_NOTICE_DAYS = 3;
export const MAX_DIET_PHASES = 52;
export const MAX_DIET_PHASE_WEEKS = 104;

/** The last day the plan gives the phase: its end date, else start + weeks; null if open-ended. */
export function dietPhasePlannedEnd(phase: DietPhasePlan): string | null {
  if (phase.end_date) return phase.end_date;
  if (phase.duration_weeks && phase.duration_weeks > 0) {
    return addDays(phase.start_date, phase.duration_weeks * 7 - 1);
  }
  return null;
}

/**
 * The phase's actual last day (inclusive): the planned end, or the day its
 * weight target was reached when that comes first. Null while open-ended.
 */
export function dietPhaseEnd(phase: DietPhaseLike): string | null {
  const planned = dietPhasePlannedEnd(phase);
  const reached = phase.target_reached_on;
  if (!reached) return planned;
  if (!planned) return reached;
  return compareDays(reached, planned) < 0 ? reached : planned;
}

export function dietPhaseCoversDay(phase: DietPhaseLike, day: string): boolean {
  if (compareDays(day, phase.start_date) < 0) return false;
  const end = dietPhaseEnd(phase);
  return end === null || compareDays(day, end) <= 0;
}

/** Phases in start order (a copy). */
export function sortDietPhases<T extends DietPhasePlan>(
  phases: readonly T[]
): T[] {
  return [...phases].sort((a, b) => compareDays(a.start_date, b.start_date));
}

export type DietPhaseProblem =
  | { kind: 'no_end'; index: number }
  | { kind: 'end_before_start'; index: number }
  | { kind: 'overlap'; index: number; otherIndex: number };

/**
 * What makes a list of phases unusable: a phase with no end date, duration or
 * weight target, an end before the start, or two phases sharing a day (an
 * open-ended phase overlaps every later one). Indexes refer to `phases` as
 * given. Gaps between phases are allowed: those days use the base setting.
 */
export function findDietPhaseProblems(
  phases: readonly DietPhaseLike[]
): DietPhaseProblem[] {
  const problems: DietPhaseProblem[] = [];
  phases.forEach((phase, index) => {
    const planned = dietPhasePlannedEnd(phase);
    if (planned === null && phase.target_weight_kg === null) {
      problems.push({ kind: 'no_end', index });
    } else if (planned !== null && compareDays(planned, phase.start_date) < 0) {
      problems.push({ kind: 'end_before_start', index });
    }
  });
  const order = phases
    .map((phase, index) => ({ phase, index }))
    .sort((a, b) => compareDays(a.phase.start_date, b.phase.start_date));
  for (let i = 0; i < order.length - 1; i++) {
    const current = order[i]!;
    const end = dietPhaseEnd(current.phase);
    for (let j = i + 1; j < order.length; j++) {
      const later = order[j]!;
      if (end === null || compareDays(later.phase.start_date, end) <= 0) {
        problems.push({
          kind: 'overlap',
          index: later.index,
          otherIndex: current.index,
        });
      } else {
        break;
      }
    }
  }
  return problems;
}

/** The phase covering `day`, or null for a day in a gap or outside the plan. */
export function dietPhaseOnDay<T extends DietPhaseLike>(
  phases: readonly T[],
  day: string
): T | null {
  for (const phase of phases) {
    if (dietPhaseCoversDay(phase, day)) return phase;
  }
  return null;
}

/** Signed kg/week: negative for loss, zero for maintenance, positive for gain. */
export function dietPhaseSignedWeeklyChangeKg(phase: DietPhasePlan): number {
  if (phase.phase_type === 'maintenance') return 0;
  const magnitude = Math.abs(phase.weekly_change_kg);
  return phase.phase_type === 'loss' ? -magnitude : magnitude;
}

/** The Goal Mode settings a phase stands for. */
export function dietPhaseGoalRules(phase: DietPhasePlan): {
  goal_mode: 'weekly';
  goal_mode_weekly_change_kg: number;
} {
  return {
    goal_mode: 'weekly',
    goal_mode_weekly_change_kg: dietPhaseSignedWeeklyChangeKg(phase),
  };
}

/**
 * `rules` with Goal Mode and its weekly rate replaced by the phase covering
 * `day`; unchanged (the same object) when no phase covers it. Every other
 * calorie setting, including the calculation method, safety floor and calorie
 * cycling, stays the person's own.
 */
export function applyDietPhaseToRules<T extends object>(
  rules: T,
  phases: readonly DietPhaseLike[],
  day: string
): T {
  const phase = dietPhaseOnDay(phases, day);
  return phase ? { ...rules, ...dietPhaseGoalRules(phase) } : rules;
}

interface PhaseSegment {
  start: string;
  end: string;
  weeklyChangeKg: number;
}

/** What the phases decide for each day before `today`, as merged runs of equal settings. */
function pastSegments(
  phases: readonly DietPhaseLike[],
  today: string
): PhaseSegment[] {
  const yesterday = addDays(today, -1);
  const segments: PhaseSegment[] = [];
  for (const phase of sortDietPhases(phases)) {
    if (compareDays(phase.start_date, today) >= 0) continue;
    const end = dietPhaseEnd(phase);
    const clippedEnd =
      end === null || compareDays(end, yesterday) > 0 ? yesterday : end;
    const weeklyChangeKg = dietPhaseSignedWeeklyChangeKg(phase);
    const last = segments[segments.length - 1];
    if (
      last &&
      last.weeklyChangeKg === weeklyChangeKg &&
      addDays(last.end, 1) === phase.start_date
    ) {
      last.end = clippedEnd;
    } else {
      segments.push({
        start: phase.start_date,
        end: clippedEnd,
        weeklyChangeKg,
      });
    }
  }
  return segments;
}

/**
 * Whether replacing `before` with `after` would change the Goal Mode of a day
 * before `today`. Past days keep the settings they were logged against, so
 * such a change is refused; a phase may still be ended today or later.
 */
export function dietPhasesChangePast(
  before: readonly DietPhaseLike[],
  after: readonly DietPhaseLike[],
  today: string
): boolean {
  const a = pastSegments(before, today);
  const b = pastSegments(after, today);
  if (a.length !== b.length) return true;
  return a.some(
    (segment, i) =>
      segment.start !== b[i]!.start ||
      segment.end !== b[i]!.end ||
      segment.weeklyChangeKg !== b[i]!.weeklyChangeKg
  );
}

/**
 * Whether the weight trend has reached the phase's target: the latest trend
 * point on or after the phase start and not after `today` is at or below the
 * target for a loss phase, at or above it for a gain phase. Trend values are
 * in kg (see `computeDailyWeightTrend`).
 */
export function dietPhaseTargetReached(
  phase: DietPhaseLike,
  dailyTrend: readonly { date: string; trend: number }[],
  today: string
): boolean {
  const target = phase.target_weight_kg;
  if (target === null || phase.phase_type === 'maintenance') return false;
  let latest: { date: string; trend: number } | null = null;
  for (const point of dailyTrend) {
    if (
      compareDays(point.date, phase.start_date) >= 0 &&
      compareDays(point.date, today) <= 0 &&
      (!latest || compareDays(point.date, latest.date) > 0)
    ) {
      latest = point;
    }
  }
  if (!latest) return false;
  return phase.phase_type === 'loss'
    ? latest.trend <= target
    : latest.trend >= target;
}

export interface DietPhaseTimelineStatus<T> {
  current: T | null;
  /** Days left in the current phase, today included; null when open-ended or no phase. */
  daysLeft: number | null;
  /** The next phase that starts after today. */
  next: T | null;
  /** The next day the Goal Mode changes (a phase ends or starts), or null. */
  changeOn: string | null;
  /** Days from today to `changeOn`. */
  daysUntilChange: number | null;
  /** True when the change is at most `DIET_PHASE_CHANGE_NOTICE_DAYS` days away. */
  changeSoon: boolean;
}

/** Where today sits in the plan: the current phase, what comes next and when. */
export function dietPhaseTimelineStatus<T extends DietPhaseLike>(
  phases: readonly T[],
  today: string
): DietPhaseTimelineStatus<T> {
  const sorted = sortDietPhases(phases);
  const current = dietPhaseOnDay(sorted, today);
  const next =
    sorted.find((phase) => compareDays(phase.start_date, today) > 0) ?? null;
  const currentEnd = current ? dietPhaseEnd(current) : null;
  const daysLeft =
    current && currentEnd !== null ? daysBetween(today, currentEnd) + 1 : null;
  let changeOn: string | null = null;
  if (current) {
    changeOn = currentEnd === null ? null : addDays(currentEnd, 1);
  } else if (next) {
    changeOn = next.start_date;
  }
  const daysUntilChange =
    changeOn === null ? null : daysBetween(today, changeOn);
  return {
    current,
    daysLeft,
    next,
    changeOn,
    daysUntilChange,
    changeSoon:
      daysUntilChange !== null &&
      daysUntilChange <= DIET_PHASE_CHANGE_NOTICE_DAYS,
  };
}

/** A phase as `PUT /api/v2/diet-phases` takes it (the fields a person set). */
export interface DietPhaseSaveInput extends DietPhasePlan {
  id?: string;
  label: string | null;
}

/**
 * The save body for `phases` as the server returned them, so a client can
 * change one phase and send the whole plan back. Reached days and computed
 * ends are the server's and are left out.
 */
export function dietPhaseSaveInputs(
  phases: readonly (DietPhaseSaveInput & { id: string })[]
): DietPhaseSaveInput[] {
  return phases.map((phase) => ({
    id: phase.id,
    phase_type: phase.phase_type,
    weekly_change_kg: phase.weekly_change_kg,
    start_date: phase.start_date,
    end_date: phase.end_date,
    duration_weeks: phase.duration_weeks,
    target_weight_kg: phase.target_weight_kg,
    label: phase.label,
  }));
}

/** Whether the phase has started by `today`, so only its end may still change. */
export function dietPhaseHasStarted(
  phase: DietPhasePlan,
  today: string
): boolean {
  return compareDays(phase.start_date, today) < 0;
}
