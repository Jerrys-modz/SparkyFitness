import { describe, expect, it } from 'vitest';
import {
  BODY_FAT_GOAL_MAX_PERCENT,
  BODY_FAT_GOAL_MIN_PERCENT,
  assessGoalForecast,
  computeMeasurementTrend,
  computeWeightTrend,
  forecastGoalDate,
  impliedGoalWeight,
  isValidBodyFatGoal,
  parseBodyFatGoal,
  addDays,
} from '@workspace/shared';

describe('body fat goal range', () => {
  it('accepts the ends and refuses values outside them', () => {
    expect(isValidBodyFatGoal(BODY_FAT_GOAL_MIN_PERCENT)).toBe(true);
    expect(isValidBodyFatGoal(BODY_FAT_GOAL_MAX_PERCENT)).toBe(true);
    expect(isValidBodyFatGoal(2.9)).toBe(false);
    expect(isValidBodyFatGoal(60.1)).toBe(false);
    expect(isValidBodyFatGoal(Number.NaN)).toBe(false);
  });

  it('judges the value after rounding to the stored decimal', () => {
    expect(isValidBodyFatGoal(2.96)).toBe(true);
    expect(isValidBodyFatGoal(60.04)).toBe(true);
  });

  it('parses the NUMERIC string node-postgres returns', () => {
    expect(parseBodyFatGoal('18.5')).toBe(18.5);
    expect(parseBodyFatGoal(20)).toBe(20);
    expect(parseBodyFatGoal(null)).toBeNull();
    expect(parseBodyFatGoal(undefined)).toBeNull();
    expect(parseBodyFatGoal('')).toBeNull();
    expect(parseBodyFatGoal('abc')).toBeNull();
    expect(parseBodyFatGoal('75')).toBeNull();
  });
});

describe('impliedGoalWeight', () => {
  it('keeps lean mass and solves for the target', () => {
    // 80 kg at 25% = 60 kg lean; 60 / (1 - 0.15) = 70.588...
    expect(impliedGoalWeight(80, 25, 15)).toBeCloseTo(70.588, 3);
  });

  it('works in any weight unit', () => {
    expect(impliedGoalWeight(200, 30, 20)).toBeCloseTo(175, 6);
  });

  it('gives a higher weight when the target is above the current reading', () => {
    expect(impliedGoalWeight(60, 10, 15)).toBeCloseTo(63.529, 3);
  });

  it('returns null for missing or impossible input', () => {
    expect(impliedGoalWeight(null, 25, 15)).toBeNull();
    expect(impliedGoalWeight(80, null, 15)).toBeNull();
    expect(impliedGoalWeight(80, 25, null)).toBeNull();
    expect(impliedGoalWeight(0, 25, 15)).toBeNull();
    expect(impliedGoalWeight(80, 0, 15)).toBeNull();
    expect(impliedGoalWeight(80, 100, 15)).toBeNull();
    expect(impliedGoalWeight(80, 25, 1)).toBeNull();
    expect(impliedGoalWeight(80, 25, 70)).toBeNull();
  });
});

describe('goal forecast for any measurement', () => {
  const start = '2026-01-01';
  // Body fat falling 0.5 points a week from 25%, read every other day.
  const bodyFat = Array.from({ length: 15 }, (_, i) => ({
    date: addDays(start, i * 2),
    value: 25 - (0.5 / 7) * i * 2,
  }));

  it('smooths a non-weight series the same way as weight', () => {
    const generic = computeMeasurementTrend(bodyFat);
    const asWeight = computeWeightTrend(
      bodyFat.map((s) => ({ date: s.date, weight: s.value }))
    );
    expect(generic.map((p) => p.trend)).toEqual(asWeight.map((p) => p.trend));
    expect(generic[0]).toMatchObject({ date: start, value: 25 });
  });

  it('projects when body fat reaches the target', () => {
    const trend = computeMeasurementTrend(bodyFat);
    const assessment = assessGoalForecast(trend, 20);
    expect(assessment.status).toBe('toward-goal');
    const last = trend[trend.length - 1]!;
    // About (last trend - 20) / 0.5 weeks out.
    const expectedDays = ((last.trend - 20) / 0.5) * 7;
    expect(assessment.forecast?.daysRemaining).toBeGreaterThan(
      expectedDays - 3
    );
    expect(assessment.forecast?.daysRemaining).toBeLessThan(expectedDays + 3);
    expect(forecastGoalDate(trend, 20)?.date).toBe(assessment.forecast?.date);
  });

  it('says moving away when body fat heads from the target', () => {
    const trend = computeMeasurementTrend(bodyFat);
    expect(assessGoalForecast(trend, 30).status).toBe('away-from-goal');
  });
});
