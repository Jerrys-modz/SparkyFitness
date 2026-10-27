import { describe, expect, it } from 'vitest';
import {
  buildGutTrainingRamp,
  computeDrinkPlan,
  GUT_TRAINING_MAX_WEEKS,
} from '@workspace/shared';

describe('buildGutTrainingRamp', () => {
  it('has nothing to build when the race is today, past or not a day', () => {
    const base = { targetCarbsPerHour: 60 };
    expect(
      buildGutTrainingRamp({
        ...base,
        today: '2026-10-27',
        raceDay: '2026-10-27',
      })
    ).toBeNull();
    expect(
      buildGutTrainingRamp({
        ...base,
        today: '2026-10-27',
        raceDay: '2026-10-01',
      })
    ).toBeNull();
    expect(
      buildGutTrainingRamp({ ...base, today: '2026-10-27', raceDay: 'soon' })
    ).toBeNull();
  });

  it('has nothing to build toward without a target', () => {
    expect(
      buildGutTrainingRamp({
        today: '2026-10-27',
        raceDay: '2026-12-27',
        targetCarbsPerHour: 0,
      })
    ).toBeNull();
  });

  it('steps up evenly and reaches the target two weeks before the race', () => {
    // 10 weeks out: 8 weeks of build-up, then 2 weeks holding.
    const ramp = buildGutTrainingRamp({
      today: '2026-10-27',
      raceDay: '2027-01-05',
      targetCarbsPerHour: 90,
    });

    expect(ramp?.status).toBe('ramping');
    expect(ramp?.daysToRace).toBe(70);
    expect(ramp?.rampStartDay).toBe('2026-10-27');
    // 30 -> 90 over 8 weeks, to the nearest 5
    expect(ramp?.weeks.map((w) => w.carbsPerHour)).toEqual([
      40, 45, 55, 60, 70, 75, 85, 90, 90,
    ]);
    expect(ramp?.weeks.at(-1)).toEqual({
      startDay: '2026-12-22',
      carbsPerHour: 90,
    });
    expect(ramp?.currentCarbsPerHour).toBe(40);
  });

  it('never decreases and ends on the target', () => {
    const ramp = buildGutTrainingRamp({
      today: '2026-10-27',
      raceDay: '2027-02-01',
      targetCarbsPerHour: 75,
    });
    const values = ramp?.weeks.map((w) => w.carbsPerHour) ?? [];
    expect(values.at(-1)).toBe(75);
    expect(values).toEqual([...values].sort((a, b) => a - b));
  });

  it('keeps the same weeks from day to day when the start day is fixed', () => {
    const input = {
      raceDay: '2027-01-05',
      targetCarbsPerHour: 90,
      startDay: '2026-10-27',
    };
    const first = buildGutTrainingRamp({ ...input, today: '2026-10-27' });
    const later = buildGutTrainingRamp({ ...input, today: '2026-11-20' });

    expect(later?.weeks).toEqual(first?.weeks);
    expect(later?.status).toBe('ramping');
    // 24 days in is the fourth week of the build-up
    expect(later?.currentCarbsPerHour).toBe(60);
  });

  it('treats a start day in the future as today', () => {
    const ramp = buildGutTrainingRamp({
      today: '2026-10-27',
      raceDay: '2027-01-05',
      targetCarbsPerHour: 90,
      startDay: '2026-12-01',
    });
    expect(ramp?.rampStartDay).toBe('2026-10-27');
  });

  it('holds the target in the last two weeks', () => {
    const ramp = buildGutTrainingRamp({
      today: '2026-12-28',
      raceDay: '2027-01-05',
      targetCarbsPerHour: 90,
      startDay: '2026-10-27',
    });
    expect(ramp?.status).toBe('holding');
    expect(ramp?.currentCarbsPerHour).toBe(90);
  });

  it('says there is not enough time when the race is under three weeks away', () => {
    const ramp = buildGutTrainingRamp({
      today: '2026-10-27',
      raceDay: '2026-11-10',
      targetCarbsPerHour: 90,
    });
    expect(ramp?.status).toBe('short');
    expect(ramp?.currentCarbsPerHour).toBe(30);
    expect(ramp?.weeks).toEqual([]);
  });

  it('just holds when the target is no more than the starting amount', () => {
    const ramp = buildGutTrainingRamp({
      today: '2026-10-27',
      raceDay: '2027-01-05',
      targetCarbsPerHour: 30,
    });
    expect(ramp?.status).toBe('holding');
    expect(ramp?.currentCarbsPerHour).toBe(30);
    expect(ramp?.weeks).toEqual([]);
  });

  it('never starts above a target that is below the default start', () => {
    const ramp = buildGutTrainingRamp({
      today: '2026-10-27',
      raceDay: '2027-01-05',
      targetCarbsPerHour: 20,
    });
    expect(ramp?.startCarbsPerHour).toBe(20);
    expect(ramp?.currentCarbsPerHour).toBe(20);
  });

  it('waits to begin when the race is far off, and caps the weeks shown', () => {
    const ramp = buildGutTrainingRamp({
      today: '2026-10-27',
      raceDay: '2027-10-27',
      targetCarbsPerHour: 90,
    });
    expect(ramp?.status).toBe('not_started');
    expect(ramp?.currentCarbsPerHour).toBe(30);
    expect(ramp?.weeks).toHaveLength(GUT_TRAINING_MAX_WEEKS + 1);
    expect(ramp?.rampStartDay && ramp.rampStartDay > '2026-10-27').toBe(true);
  });

  it('starts from the amount asked for', () => {
    const ramp = buildGutTrainingRamp({
      today: '2026-10-27',
      raceDay: '2027-01-05',
      targetCarbsPerHour: 90,
      startCarbsPerHour: 40,
    });
    expect(ramp?.startCarbsPerHour).toBe(40);
    expect(ramp?.weeks[0]?.carbsPerHour).toBeGreaterThan(40);
  });
});

describe('computeDrinkPlan', () => {
  it('defaults to 150 ml every 20 minutes', () => {
    const plan = computeDrinkPlan({ durationMin: 120 });
    expect(plan.intervalMin).toBe(20);
    expect(plan.mlPerDrink).toBe(150);
    expect(plan.mlPerHour).toBe(450);
    expect(plan.reminderOffsetsMin).toEqual([20, 40, 60, 80, 100]);
    expect(plan.totalMl).toBe(900);
    expect(plan.high).toBe(false);
  });

  it('uses the amounts the person sets', () => {
    const plan = computeDrinkPlan({
      durationMin: 60,
      intervalMin: 15,
      mlPerDrink: 100,
    });
    expect(plan.mlPerHour).toBe(400);
    expect(plan.reminderOffsetsMin).toEqual([15, 30, 45]);
  });

  it('flags a plan above 800 ml an hour', () => {
    expect(
      computeDrinkPlan({ durationMin: 120, intervalMin: 10, mlPerDrink: 200 })
        .high
    ).toBe(true);
    expect(
      computeDrinkPlan({ durationMin: 120, intervalMin: 15, mlPerDrink: 200 })
        .high
    ).toBe(false);
  });

  it('keeps the amounts in a sensible range', () => {
    const plan = computeDrinkPlan({
      durationMin: 60,
      intervalMin: 1,
      mlPerDrink: 5000,
    });
    expect(plan.intervalMin).toBe(5);
    expect(plan.mlPerDrink).toBe(500);
  });

  it('ignores unusable values', () => {
    const plan = computeDrinkPlan({
      durationMin: Number.NaN,
      intervalMin: -3,
      mlPerDrink: 0,
    });
    expect(plan.intervalMin).toBe(20);
    expect(plan.mlPerDrink).toBe(150);
    expect(plan.reminderOffsetsMin).toEqual([]);
    expect(plan.totalMl).toBe(0);
  });
});
