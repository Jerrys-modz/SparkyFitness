import type {
  EnergyUnit,
  WidgetDataSnapshot,
  WidgetMetric,
  WidgetMetricValue,
} from '@workspace/shared';
import type { DailySummary } from '../types/dailySummary';

/**
 * Figures the daily summary does not carry. Each comes from its own query, so
 * every field is optional: a metric whose input is missing is left out of the
 * snapshot and the widget shows its empty state, never a false zero.
 */
export interface WidgetMetricExtras {
  steps?: number;
  stepsGoal?: number;
  /** Latest weight in kg. */
  weightKg?: number;
  /** Last night's main sleep, in minutes. */
  sleepMinutes?: number;
  restingHeartRate?: number;
  /** Latest heart rate reading in bpm. */
  heartRate?: number;
  /** Start of the running fast, epoch ms. Absent when not fasting. */
  fastStartedAt?: number;
  loggingStreakDays?: number;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function withGoal(value: number, goal: number | undefined, unit: string) {
  const metric: WidgetMetricValue = { value, unit };
  if (goal !== undefined && goal > 0) {
    metric.goal = goal;
    metric.progress = clamp01(value / goal);
  }
  return metric;
}

function isFiniteNumber(n: number | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}

/**
 * Builds the number set every custom widget reads. Energy values stay in kcal
 * and carry the unit token `energy`, with `energyUnit` alongside, like the
 * other widget snapshots; the
 * Swift renderer converts for display.
 */
export function buildWidgetDataSnapshot(
  summary: DailySummary,
  extras: WidgetMetricExtras,
  energyUnit: EnergyUnit,
  lastUpdated: number
): WidgetDataSnapshot {
  const metrics: Partial<Record<WidgetMetric, WidgetMetricValue>> = {};
  const balance = summary.calorieBalance;

  if (balance) {
    metrics.calories_remaining = {
      value: balance.remaining,
      goal: balance.goal,
      progress: balance.goal > 0 ? clamp01(balance.progress / 100) : undefined,
      unit: 'energy',
    };
    metrics.calories_eaten = withGoal(balance.eaten, balance.goal, 'energy');
    metrics.calories_burned = { value: balance.burned, unit: 'energy' };
    metrics.calorie_goal = { value: balance.goal, unit: 'energy' };
  }

  metrics.protein = withGoal(
    summary.protein.consumed,
    summary.protein.goal,
    'g'
  );
  metrics.carbs = withGoal(summary.carbs.consumed, summary.carbs.goal, 'g');
  metrics.fat = withGoal(summary.fat.consumed, summary.fat.goal, 'g');
  metrics.water = withGoal(summary.waterConsumed, summary.waterGoal, 'ml');
  metrics.exercise_minutes = withGoal(
    summary.exerciseMinutes,
    summary.exerciseMinutesGoal,
    'min'
  );

  if (isFiniteNumber(extras.steps)) {
    metrics.steps = withGoal(
      extras.steps,
      extras.stepsGoal ?? summary.stepsGoal,
      'steps'
    );
  }
  if (isFiniteNumber(extras.weightKg)) {
    metrics.weight = { value: extras.weightKg, unit: 'kg' };
  }
  if (isFiniteNumber(extras.sleepMinutes)) {
    metrics.sleep_duration = { value: extras.sleepMinutes, unit: 'min' };
  }
  if (isFiniteNumber(extras.restingHeartRate)) {
    metrics.resting_heart_rate = {
      value: extras.restingHeartRate,
      unit: 'bpm',
    };
  }
  if (isFiniteNumber(extras.heartRate)) {
    metrics.heart_rate = { value: extras.heartRate, unit: 'bpm' };
  }
  if (isFiniteNumber(extras.fastStartedAt)) {
    // The start, not the elapsed time: the widget runs the clock itself.
    metrics.fasting_elapsed = {
      value: Math.floor(extras.fastStartedAt / 1000),
      unit: 'since',
    };
  }
  if (isFiniteNumber(extras.loggingStreakDays)) {
    metrics.logging_streak = { value: extras.loggingStreakDays, unit: 'days' };
  }

  return { date: summary.date, lastUpdated, energyUnit, metrics };
}
