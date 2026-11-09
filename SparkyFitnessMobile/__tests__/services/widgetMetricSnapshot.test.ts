import { buildWidgetDataSnapshot } from '../../src/services/widgetMetricSnapshot';
import type { DailySummary } from '../../src/types/dailySummary';

const summary = {
  date: '2026-11-09',
  protein: { consumed: 80, goal: 160 },
  carbs: { consumed: 200, goal: 0 },
  fat: { consumed: 50, goal: 50 },
  waterConsumed: 1500,
  waterGoal: 2000,
  exerciseMinutes: 45,
  exerciseMinutesGoal: 30,
  stepsGoal: 10000,
  calorieBalance: {
    eaten: 1200,
    burned: 300,
    goal: 2000,
    remaining: 1100,
    progress: 52,
  },
} as unknown as DailySummary;

describe('buildWidgetDataSnapshot', () => {
  it('carries the date, unit and update time', () => {
    const snap = buildWidgetDataSnapshot(summary, {}, 'kJ', 123);
    expect(snap).toMatchObject({
      date: '2026-11-09',
      energyUnit: 'kJ',
      lastUpdated: 123,
    });
  });

  it('keeps energy in kcal and uses the balance progress', () => {
    const { metrics } = buildWidgetDataSnapshot(summary, {}, 'kJ', 0);
    expect(metrics.calories_remaining).toEqual({
      value: 1100,
      goal: 2000,
      progress: 0.52,
      unit: 'energy',
    });
    expect(metrics.calories_eaten?.progress).toBeCloseTo(0.6);
    expect(metrics.calorie_goal).toEqual({ value: 2000, unit: 'energy' });
  });

  it('gives no goal or progress when the goal is zero', () => {
    const { metrics } = buildWidgetDataSnapshot(summary, {}, 'kcal', 0);
    expect(metrics.carbs).toEqual({ value: 200, unit: 'g' });
  });

  it('clamps progress at 1 when a goal is exceeded', () => {
    const { metrics } = buildWidgetDataSnapshot(summary, {}, 'kcal', 0);
    expect(metrics.exercise_minutes?.progress).toBe(1);
  });

  it('leaves out metrics with no input instead of showing zero', () => {
    const { metrics } = buildWidgetDataSnapshot(summary, {}, 'kcal', 0);
    expect(metrics.steps).toBeUndefined();
    expect(metrics.weight).toBeUndefined();
    expect(metrics.fasting_elapsed).toBeUndefined();
  });

  it('adds extras and falls back to the summary steps goal', () => {
    const { metrics } = buildWidgetDataSnapshot(
      summary,
      {
        steps: 5000,
        weightKg: 80.5,
        sleepMinutes: 450,
        restingHeartRate: 55,
        heartRate: 72,
        loggingStreakDays: 9,
        fastStartedAt: 1_800_000_000_500,
      },
      'kcal',
      0
    );
    expect(metrics.steps).toEqual({
      value: 5000,
      goal: 10000,
      progress: 0.5,
      unit: 'steps',
    });
    expect(metrics.weight).toEqual({ value: 80.5, unit: 'kg' });
    expect(metrics.sleep_duration?.unit).toBe('min');
    expect(metrics.resting_heart_rate?.value).toBe(55);
    expect(metrics.heart_rate?.value).toBe(72);
    expect(metrics.logging_streak).toEqual({ value: 9, unit: 'days' });
    // The fast's start in epoch seconds, so the widget can run the clock.
    expect(metrics.fasting_elapsed).toEqual({
      value: 1_800_000_000,
      unit: 'since',
    });
  });

  it('ignores non-finite extras', () => {
    const { metrics } = buildWidgetDataSnapshot(
      summary,
      { weightKg: Number.NaN },
      'kcal',
      0
    );
    expect(metrics.weight).toBeUndefined();
  });
});
