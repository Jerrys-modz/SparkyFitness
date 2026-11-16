import {
  addDays,
  compareDays,
  computeDailyWeightTrend,
  dietPhaseEnd,
  dietPhasePlannedEnd,
  dietPhaseTargetReached,
  dietPhaseTimelineStatus,
  dietPhasesChangePast,
  findDietPhaseProblems,
  sortDietPhases,
  todayInZone,
} from '@workspace/shared';
import type {
  DietPhase,
  DietPhaseErrorCode,
  DietPhasesResponse,
  SaveDietPhasesBody,
} from '@workspace/shared';
import dietPhaseRepository from '../models/dietPhaseRepository.js';
import type {
  DietPhaseRecord,
  DietPhaseToSave,
} from '../models/dietPhaseRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

/** A plan the server refuses; the route answers 400 with `code`. */
export class DietPhaseValidationError extends Error {
  constructor(
    readonly code: DietPhaseErrorCode,
    message: string
  ) {
    super(message);
  }
}

/** Trend days needed before the latest point: the trend is a 7-day average. */
const TREND_LEAD_DAYS = 14;

/** Whether the phase could still end by reaching its target today. */
function awaitsTarget(phase: DietPhaseRecord, today: string): boolean {
  if (phase.target_weight_kg === null || phase.target_reached_on) return false;
  if (compareDays(phase.start_date, today) > 0) return false;
  const planned = dietPhasePlannedEnd(phase);
  return planned === null || compareDays(planned, today) >= 0;
}

/**
 * The person's phases with each running phase's weight target checked against
 * today's trend. A phase whose target is reached ends today (never earlier, so
 * a late weigh-in cannot change a past day) and that day is recorded.
 */
async function resolvePhases(
  userId: string,
  today: string,
  authenticatedUserId?: string
): Promise<DietPhaseRecord[]> {
  const phases = await dietPhaseRepository.getDietPhases(
    userId,
    authenticatedUserId
  );
  const waiting = phases.filter((phase) => awaitsTarget(phase, today));
  if (waiting.length === 0) return phases;
  const earliest = waiting.reduce(
    (min, phase) =>
      compareDays(phase.start_date, min) < 0 ? phase.start_date : min,
    today
  );
  const weights = await dietPhaseRepository.getWeightsInRange(
    userId,
    addDays(earliest, -TREND_LEAD_DAYS),
    today,
    authenticatedUserId
  );
  const trend = computeDailyWeightTrend(weights);
  const resolved: DietPhaseRecord[] = [];
  for (const phase of phases) {
    if (
      waiting.includes(phase) &&
      dietPhaseTargetReached(phase, trend, today)
    ) {
      await dietPhaseRepository.markDietPhaseTargetReached(
        userId,
        phase.id,
        today,
        authenticatedUserId
      );
      resolved.push({ ...phase, target_reached_on: today });
    } else {
      resolved.push(phase);
    }
  }
  return resolved;
}

/**
 * The phases the calorie engine applies, for any range of days. Empty when
 * the person has no plan, so their targets are exactly as without phases.
 */
export async function loadDietPhasesForCalories(
  userId: string,
  authenticatedUserId?: string
): Promise<DietPhaseRecord[]> {
  const tz = await loadUserTimezone(userId);
  return resolvePhases(userId, todayInZone(tz), authenticatedUserId);
}

function toView(phase: DietPhaseRecord): DietPhase {
  return { ...phase, effective_end_date: dietPhaseEnd(phase) };
}

function buildResponse(
  phases: readonly DietPhaseRecord[],
  today: string
): DietPhasesResponse {
  const views = sortDietPhases(phases.map(toView));
  const status = dietPhaseTimelineStatus(views, today);
  return {
    today,
    phases: views,
    status: {
      current: status.current,
      days_left: status.daysLeft,
      next: status.next,
      change_on: status.changeOn,
      days_until_change: status.daysUntilChange,
      change_soon: status.changeSoon,
    },
  };
}

export async function getDietPhaseOverview(
  userId: string,
  authenticatedUserId?: string
): Promise<DietPhasesResponse> {
  const today = todayInZone(await loadUserTimezone(userId));
  return buildResponse(
    await resolvePhases(userId, today, authenticatedUserId),
    today
  );
}

/**
 * The rows to write for `body` against the stored plan, or a refusal: an id
 * that is not one of the person's phases, a phase without an end, overlapping
 * phases, or a change to what any day before `today` used. A kept phase keeps
 * its reached day unless its target changed.
 */
export function planDietPhaseSave(
  existing: readonly DietPhaseRecord[],
  body: SaveDietPhasesBody,
  today: string
): DietPhaseToSave[] {
  const byId = new Map(existing.map((phase) => [phase.id, phase]));
  const seen = new Set<string>();
  const phases: DietPhaseToSave[] = body.phases.map((phase) => {
    let reached: string | null = null;
    if (phase.id) {
      const stored = byId.get(phase.id);
      if (!stored || seen.has(phase.id)) {
        throw new DietPhaseValidationError('invalid', 'Unknown phase id');
      }
      seen.add(phase.id);
      if (stored.target_weight_kg === phase.target_weight_kg) {
        reached = stored.target_reached_on;
      }
    }
    return { ...phase, target_reached_on: reached };
  });
  const problem = findDietPhaseProblems(phases)[0];
  if (problem) {
    throw new DietPhaseValidationError(
      problem.kind === 'overlap' ? 'overlap' : 'invalid',
      problem.kind === 'overlap'
        ? 'Phases overlap: each day can belong to one phase only'
        : problem.kind === 'no_end'
          ? 'A phase needs an end date, a duration or a target weight'
          : 'A phase ends before it starts'
    );
  }
  if (dietPhasesChangePast(existing, phases, today)) {
    throw new DietPhaseValidationError(
      'past_locked',
      'Past days keep the settings they were logged with: phases can only change from today on'
    );
  }
  return phases;
}

export async function saveDietPhases(
  userId: string,
  body: SaveDietPhasesBody,
  authenticatedUserId?: string
): Promise<DietPhasesResponse> {
  const today = todayInZone(await loadUserTimezone(userId));
  await dietPhaseRepository.replaceDietPhases(
    userId,
    (existing) => planDietPhaseSave(existing, body, today),
    authenticatedUserId
  );
  return getDietPhaseOverview(userId, authenticatedUserId);
}

export default {
  loadDietPhasesForCalories,
  getDietPhaseOverview,
  planDietPhaseSave,
  saveDietPhases,
};
