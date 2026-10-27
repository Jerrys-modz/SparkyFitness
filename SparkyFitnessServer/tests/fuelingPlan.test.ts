import { describe, expect, it } from 'vitest';
import {
  computeFuelingPlan,
  fuelingCarbRange,
  FUELING_DEFAULT_PORTION_GRAMS,
} from '@workspace/shared';

describe('fuelingCarbRange', () => {
  it('suggests nothing under an hour', () => {
    expect(fuelingCarbRange(59)).toEqual({ min: 0, max: 0 });
  });

  it('uses 30-60 g/h from an hour to two and a half hours', () => {
    expect(fuelingCarbRange(60)).toEqual({ min: 30, max: 60 });
    expect(fuelingCarbRange(150)).toEqual({ min: 30, max: 60 });
  });

  it('uses 60-90 g/h beyond two and a half hours', () => {
    expect(fuelingCarbRange(151)).toEqual({ min: 60, max: 90 });
  });

  it('treats invalid durations as no fueling', () => {
    expect(fuelingCarbRange(Number.NaN)).toEqual({ min: 0, max: 0 });
  });
});

describe('computeFuelingPlan', () => {
  it('plans no fuel for a short run', () => {
    const plan = computeFuelingPlan({ durationMin: 45 });
    expect(plan.needsFuel).toBe(false);
    expect(plan.carbsPerHour).toBe(0);
    expect(plan.intervalMin).toBeNull();
    expect(plan.reminderOffsetsMin).toEqual([]);
    expect(plan.totalCarbsGrams).toBe(0);
  });

  it('plans 45 g/h for a 2 h moderate run at the default experience', () => {
    const plan = computeFuelingPlan({ durationMin: 120, intensityZone: 3 });
    expect(plan.carbsPerHour).toBe(45);
    expect(plan.portionGrams).toBe(FUELING_DEFAULT_PORTION_GRAMS);
    expect(plan.intervalMin).toBe(33);
    expect(plan.totalCarbsGrams).toBe(90);
  });

  it('plans 75 g/h for a 3 h moderate run when gut training allows it', () => {
    const plan = computeFuelingPlan({
      durationMin: 180,
      intensityZone: 3,
      experience: 'advanced',
    });
    expect(plan.carbsPerHour).toBe(75);
    expect(plan.intervalMin).toBe(20);
  });

  it('caps the default by gut training', () => {
    const beginner = computeFuelingPlan({
      durationMin: 240,
      intensityZone: 5,
      experience: 'beginner',
    });
    expect(beginner.carbsPerHour).toBe(45);
    const intermediate = computeFuelingPlan({
      durationMin: 240,
      intensityZone: 5,
      experience: 'intermediate',
    });
    expect(intermediate.carbsPerHour).toBe(60);
  });

  it('aims lower for easy efforts and higher for hard ones', () => {
    const easy = computeFuelingPlan({
      durationMin: 120,
      intensityZone: 1,
      experience: 'advanced',
    });
    const hard = computeFuelingPlan({
      durationMin: 120,
      intensityZone: 5,
      experience: 'advanced',
    });
    expect(easy.carbsPerHour).toBe(30);
    expect(hard.carbsPerHour).toBe(60);
  });

  it('lets the person override the target and portion', () => {
    const plan = computeFuelingPlan({
      durationMin: 120,
      overrides: { carbsPerHour: 80, portionGrams: 40 },
    });
    expect(plan.carbsPerHour).toBe(80);
    expect(plan.carbsPerHourOverridden).toBe(true);
    expect(plan.intervalMin).toBe(30);
    expect(plan.range).toEqual({ min: 30, max: 60 });
  });

  it('honors an override even on a short run', () => {
    const plan = computeFuelingPlan({
      durationMin: 45,
      overrides: { carbsPerHour: 30 },
    });
    expect(plan.needsFuel).toBe(true);
    expect(plan.intervalMin).toBe(50);
    expect(plan.reminderOffsetsMin).toEqual([]);
  });

  it('ignores invalid overrides', () => {
    const plan = computeFuelingPlan({
      durationMin: 120,
      overrides: { carbsPerHour: -5, portionGrams: 0 },
    });
    expect(plan.carbsPerHourOverridden).toBe(false);
    expect(plan.carbsPerHour).toBe(45);
    expect(plan.portionGrams).toBe(FUELING_DEFAULT_PORTION_GRAMS);
  });

  it('limits extreme overrides', () => {
    const plan = computeFuelingPlan({
      durationMin: 120,
      overrides: { carbsPerHour: 500, portionGrams: 500 },
    });
    expect(plan.carbsPerHour).toBe(120);
    expect(plan.portionGrams).toBe(100);
  });

  it('starts reminders within the first 45 minutes and repeats until the end', () => {
    const plan = computeFuelingPlan({
      durationMin: 150,
      overrides: { carbsPerHour: 25, portionGrams: 25 },
    });
    expect(plan.intervalMin).toBe(60);
    expect(plan.reminderOffsetsMin).toEqual([45, 105]);
  });

  it('does not schedule a reminder at or after the finish', () => {
    const plan = computeFuelingPlan({
      durationMin: 120,
      overrides: { carbsPerHour: 50, portionGrams: 25 },
    });
    expect(plan.intervalMin).toBe(30);
    expect(plan.reminderOffsetsMin).toEqual([30, 60, 90]);
  });
});
