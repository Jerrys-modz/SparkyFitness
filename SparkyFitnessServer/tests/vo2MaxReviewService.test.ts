import { describe, expect, it } from 'vitest';
import { buildVo2MaxReview } from '../services/vo2MaxReviewService.js';

const base = {
  today: '2026-11-23',
  windowDays: 90,
  dateOfBirth: '1991-05-01',
  gender: 'male',
  runEstimate: null,
};

describe('buildVo2MaxReview', () => {
  it('averages sources on a day, orders the days and reads the change', () => {
    const review = buildVo2MaxReview({
      ...base,
      readings: [
        { entry_date: '2026-11-20', vo2_max: 47 },
        { entry_date: '2026-09-01', vo2_max: 44 },
        { entry_date: '2026-11-20', vo2_max: 46 },
      ],
    });
    expect(review.readings).toEqual([
      { day: '2026-09-01', value: 44 },
      { day: '2026-11-20', value: 46.5 },
    ]);
    expect(review.latest).toEqual({ day: '2026-11-20', value: 46.5 });
    expect(review.change).toBe(2.5);
    expect(review.direction).toBe('up');
    expect(review.window).toEqual({
      from: '2026-08-26',
      to: '2026-11-23',
      days: 90,
    });
  });

  it('rates the latest reading for the age and sex on file', () => {
    const review = buildVo2MaxReview({
      ...base,
      readings: [{ entry_date: '2026-11-20', vo2_max: 46.5 }],
    });
    expect(review.age).toBe(35);
    expect(review.sex).toBe('male');
    expect(review.rating).toBe('good');
    expect(review.fitnessAge).not.toBeNull();
    expect(review.change).toBeNull();
    expect(review.direction).toBeNull();
  });

  it('calls a change of 1 or less steady', () => {
    const review = buildVo2MaxReview({
      ...base,
      readings: [
        { entry_date: '2026-09-01', vo2_max: 45 },
        { entry_date: '2026-11-20', vo2_max: 45.8 },
      ],
    });
    expect(review.direction).toBe('steady');
  });

  it('gives no rating without a date of birth or a male or female sex', () => {
    const readings = [{ entry_date: '2026-11-20', vo2_max: 46.5 }];
    const noDob = buildVo2MaxReview({ ...base, dateOfBirth: null, readings });
    expect(noDob.rating).toBeNull();
    expect(noDob.fitnessAge).not.toBeNull();
    const noSex = buildVo2MaxReview({ ...base, gender: 'other', readings });
    expect(noSex.rating).toBeNull();
    expect(noSex.fitnessAge).toBeNull();
  });

  it('is empty without readings and keeps the run estimate', () => {
    const review = buildVo2MaxReview({
      ...base,
      readings: [],
      runEstimate: { value: 45.1, runs: 4 },
    });
    expect(review.latest).toBeNull();
    expect(review.rating).toBeNull();
    expect(review.runEstimate).toEqual({ value: 45.1, runs: 4 });
  });
});
