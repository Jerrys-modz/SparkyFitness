import {
  addDays,
  buildTrainingReview,
  proposePlanChanges,
  todayInZone,
} from '@workspace/shared';
import type {
  ExerciseCoachingSignal,
  PerformedSession,
  PlanProposal,
  PlanProposalAssignment,
  ReviewEntry,
} from '@workspace/shared';
import reportRepository from '../models/reportRepository.js';
import workoutPlanTemplateRepository from '../models/workoutPlanTemplateRepository.js';
import type { WorkoutPlanTemplateRow } from '../models/workoutPlanTemplateRepository.js';
import preferenceService from './preferenceService.js';
import { getWorkoutCoachingSignals } from './adaptiveWorkoutService.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

/** How far back performed sessions are read, matching the training review. */
const LOOKBACK_DAYS = 84;

export interface PlanProposalResult {
  plan: Pick<
    WorkoutPlanTemplateRow,
    'id' | 'plan_name' | 'schedule_type' | 'entry_mode'
  >;
  unit: 'kg' | 'lbs';
  proposals: PlanProposal[];
}

type SetRow = {
  id: number | string;
  set_type?: string | null;
  reps?: number | null;
  weight?: number | string | null;
};

type HistoryEntry = ReviewEntry & {
  exercise_id?: string | null;
  sets?: {
    set_type?: string | null;
    reps?: number | null;
    weight?: number | null;
    rpe?: number | null;
  }[];
};

function toNumberOrNull(
  value: number | string | null | undefined
): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function toAssignments(plan: WorkoutPlanTemplateRow): PlanProposalAssignment[] {
  const out: PlanProposalAssignment[] = [];
  for (const assignment of plan.assignments ?? []) {
    if (!assignment.exercise_id) continue;
    out.push({
      assignmentId: assignment.id,
      exerciseId: assignment.exercise_id,
      exerciseName: assignment.exercise_name ?? assignment.exercise_id,
      modality: assignment.modality ?? null,
      sets: ((assignment.sets ?? []) as unknown as SetRow[]).map((set) => ({
        id: set.id,
        setType: set.set_type ?? null,
        reps: set.reps ?? null,
        weight: toNumberOrNull(set.weight),
      })),
    });
  }
  return out;
}

/** Performed sessions per exercise, newest first, one per logged day. */
function toHistory(
  entries: readonly HistoryEntry[]
): Record<string, PerformedSession[]> {
  const byExercise = new Map<string, Map<string, PerformedSession>>();
  for (const entry of entries) {
    const exerciseId = entry.exercise_id;
    const day = entry.entry_date?.slice(0, 10);
    if (!exerciseId || !day) continue;
    const days = byExercise.get(exerciseId) ?? new Map();
    const session = days.get(day) ?? { day, sets: [] };
    for (const set of entry.sets ?? []) {
      session.sets.push({
        setType: set.set_type ?? null,
        reps: toNumberOrNull(set.reps),
        weight: toNumberOrNull(set.weight),
        rpe: toNumberOrNull(set.rpe),
      });
    }
    days.set(day, session);
    byExercise.set(exerciseId, days);
  }
  const history: Record<string, PerformedSession[]> = {};
  for (const [exerciseId, days] of byExercise) {
    history[exerciseId] = [...days.values()].sort((a, b) =>
      b.day.localeCompare(a.day)
    );
  }
  return history;
}

/**
 * Proposes weight changes for the planned sets of one workout plan (the
 * active one when no id is given). Read-only: applying a proposal is
 * `applyPlanProposals`, which recomputes them so only what the rules produce
 * can ever be written.
 */
async function getPlanProposals(
  userId: string,
  planId?: string | number
): Promise<PlanProposalResult | null> {
  let plan: WorkoutPlanTemplateRow | null;
  if (planId !== undefined) {
    plan = await workoutPlanTemplateRepository.getWorkoutPlanTemplateById(
      planId,
      userId
    );
  } else {
    const plans =
      await workoutPlanTemplateRepository.getWorkoutPlanTemplatesByUserId(
        userId
      );
    const active = (plans as unknown as WorkoutPlanTemplateRow[]).find(
      (row) => row.is_active
    );
    plan = active
      ? await workoutPlanTemplateRepository.getWorkoutPlanTemplateById(
          active.id,
          userId
        )
      : null;
  }
  if (!plan) return null;

  const assignments = toAssignments(plan);
  const exerciseIds = [...new Set(assignments.map((a) => a.exerciseId))];
  const timezone = await loadUserTimezone(userId);
  const today = todayInZone(timezone);
  const [entries, coaching, prefs] = await Promise.all([
    reportRepository.getExerciseEntries(
      userId,
      addDays(today, -LOOKBACK_DAYS),
      today
    ) as Promise<HistoryEntry[]>,
    getWorkoutCoachingSignals(userId, userId, exerciseIds, null),
    preferenceService.getUserPreferences(userId, userId),
  ]);

  const signals: Record<string, ExerciseCoachingSignal> = {};
  for (const signal of coaching.signals) signals[signal.exercise_id] = signal;
  const review = buildTrainingReview(entries as ReviewEntry[], today);
  const unit = prefs.default_weight_unit === 'lbs' ? 'lbs' : 'kg';

  return {
    plan: {
      id: plan.id,
      plan_name: plan.plan_name,
      schedule_type: plan.schedule_type,
      entry_mode: plan.entry_mode,
    },
    unit,
    proposals: proposePlanChanges({
      assignments,
      history: toHistory(entries),
      signals,
      stalledExerciseIds: review.stalls.map((stall) => stall.exerciseId),
      unit,
    }),
  };
}

export interface ApplyPlanProposalsResult {
  applied: PlanProposal[];
  /** Assignment ids asked for that have no weight change to apply. */
  skipped: (number | string)[];
}

/**
 * Writes the planned weights the rules propose for the given assignments.
 * Recomputes the proposals instead of trusting any weight from the caller.
 * A prefill plan has diary entries generated from its weights, so it is
 * refused here and goes through a full plan update instead. Only the plan's
 * owner may write, like every other plan mutation: row-level security also
 * lets family delegates read shared plans, so ownership is checked here.
 */
async function applyPlanProposals(
  userId: string,
  planId: string | number,
  assignmentIds: readonly (string | number)[]
): Promise<ApplyPlanProposalsResult | 'prefill' | null> {
  const ownerId =
    await workoutPlanTemplateRepository.getWorkoutPlanTemplateOwnerId(
      planId,
      userId
    );
  if (!ownerId) return null;
  if (ownerId !== userId) {
    throw new Error(
      'Forbidden: You do not have permission to update this workout plan template.'
    );
  }
  const result = await getPlanProposals(userId, planId);
  if (!result) return null;
  if (result.plan.entry_mode === 'prefill') return 'prefill';

  const wanted = new Set(assignmentIds.map(String));
  const applicable = result.proposals.filter(
    (proposal) =>
      wanted.has(String(proposal.assignmentId)) &&
      proposal.setChanges.length > 0
  );
  const changes = applicable.flatMap((proposal) =>
    proposal.setChanges.map((change) => ({
      setId: change.setId,
      weightKg: change.toKg,
    }))
  );
  await workoutPlanTemplateRepository.updatePlannedSetWeights(
    userId,
    planId,
    changes
  );
  const applied = new Set(applicable.map((p) => String(p.assignmentId)));
  return {
    applied: applicable,
    skipped: assignmentIds.filter((id) => !applied.has(String(id))),
  };
}

export { getPlanProposals, applyPlanProposals };
export default { getPlanProposals, applyPlanProposals };
