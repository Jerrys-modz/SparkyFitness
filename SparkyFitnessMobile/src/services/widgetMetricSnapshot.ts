import {
  WIDGET_METRIC_LINK_PATHS,
  type EnergyUnit,
  type WidgetDataSnapshot,
  type WidgetMetric,
  type WidgetMetricValue,
} from '@workspace/shared';
import type { DailySummary } from '../types/dailySummary';
import {
  volumeFromMl,
  weightFromKg,
  type WeightDisplayMode,
} from '../utils/unitConversions';

/**
 * Figures the daily summary does not carry. Each comes from its own query, so
 * every field is optional: a metric whose input is missing is left out of the
 * snapshot and the widget shows its empty state, never a false zero.
 */
export interface WidgetMetricExtras {
  steps?: number;
  stepsGoal?: number;
  /** Latest weight in kg (storage). */
  weightKg?: number;
  /**
   * How the person sees weight. The widget shows weight in this unit; kg when
   * absent.
   */
  weightUnit?: WeightDisplayMode;
  /**
   * The account's `water_display_unit` (`ml`, `oz` or `liter`). Water is shown
   * in it; ml when absent or unrecognised.
   */
  waterUnit?: string;
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

/**
 * Weight in the unit the person reads it in. Unit tokens: `kg`; `lb`; and
 * `st_lb`, a pound value the widget splits into stones and pounds.
 */
function weightMetric(kg: number, mode: WeightDisplayMode): WidgetMetricValue {
  if (mode === 'lbs') return { value: weightFromKg(kg, 'lbs'), unit: 'lb' };
  if (mode === 'st_lbs') {
    return { value: weightFromKg(kg, 'lbs'), unit: 'st_lb' };
  }
  return { value: kg, unit: 'kg' };
}

/**
 * Water in the unit the person reads it in. Unit tokens: `ml`, `oz` (fluid
 * ounces) and `liter`, with the value already converted.
 */
function waterMetric(
  ml: number,
  goalMl: number,
  waterUnit: string | undefined
): WidgetMetricValue {
  const token = waterUnit === 'oz' || waterUnit === 'liter' ? waterUnit : 'ml';
  return withGoal(volumeFromMl(ml, token), volumeFromMl(goalMl, token), token);
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
  metrics.water = waterMetric(
    summary.waterConsumed,
    summary.waterGoal,
    extras.waterUnit
  );
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
    metrics.weight = weightMetric(extras.weightKg, extras.weightUnit ?? 'kg');
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

  return {
    date: summary.date,
    lastUpdated,
    energyUnit,
    metrics,
    links: WIDGET_METRIC_LINK_PATHS,
  };
}
