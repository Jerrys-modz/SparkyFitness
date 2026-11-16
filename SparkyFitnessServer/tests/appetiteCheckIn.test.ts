import { describe, expect, it } from 'vitest';
import {
  APPETITE_CATEGORY_NAMES,
  APPETITE_SCORE_DEFAULT,
  appetiteCategoryIds,
  appetiteMetricsFor,
  appetiteValuesForDay,
  buildAppetiteTrend,
  isAppetiteCategoryName,
  parseAppetiteScore,
  summarizeAppetiteTrend,
} from '@workspace/shared';

const categories = [
  { id: 'c-hunger', name: 'GLP Hunger' },
  { id: 'c-fullness', name: 'GLP Fullness' },
  { id: 'c-noise', name: 'GLP Food Noise' },
  { id: 'c-energy', name: 'GLP Energy' },
  { id: 'c-other', name: 'Waist' },
];

describe('appetite check-in metrics', () => {
  it('keeps the GLP-1 category names, so existing rows are reused', () => {
    expect(APPETITE_CATEGORY_NAMES).toEqual([
      'GLP Hunger',
      'GLP Food Noise',
      'GLP Fullness',
      'GLP Energy',
    ]);
  });

  it('asks energy only in the GLP-1 check-in', () => {
    expect(appetiteMetricsFor('appetite').map((m) => m.key)).toEqual([
      'hunger',
      'food_noise',
      'fullness',
    ]);
    expect(appetiteMetricsFor('glp1').map((m) => m.key)).toContain('energy');
    expect(isAppetiteCategoryName('GLP Energy', 'appetite')).toBe(false);
    expect(isAppetiteCategoryName('GLP Energy')).toBe(true);
    expect(isAppetiteCategoryName('Waist')).toBe(false);
  });

  it('finds category ids by name only', () => {
    expect(appetiteCategoryIds(categories)).toEqual({
      hunger: 'c-hunger',
      fullness: 'c-fullness',
      food_noise: 'c-noise',
      energy: 'c-energy',
    });
    expect(appetiteCategoryIds([])).toEqual({});
  });

  it('accepts only scores inside 0 to 10', () => {
    expect(parseAppetiteScore('0')).toBe(0);
    expect(parseAppetiteScore('7')).toBe(7);
    expect(parseAppetiteScore('11')).toBeNull();
    expect(parseAppetiteScore('-1')).toBeNull();
    expect(parseAppetiteScore('abc')).toBeNull();
    expect(parseAppetiteScore('')).toBeNull();
  });
});

describe('appetiteValuesForDay', () => {
  it('fills unsaved metrics with the default', () => {
    const { values, hasSaved } = appetiteValuesForDay(
      categories,
      [{ category_id: 'c-hunger', value: '8' }],
      'appetite'
    );
    expect(values.hunger).toBe(8);
    expect(values.fullness).toBe(APPETITE_SCORE_DEFAULT);
    expect(hasSaved).toBe(true);
  });

  it('does not count energy as saved for the appetite check-in', () => {
    const { hasSaved } = appetiteValuesForDay(
      categories,
      [{ category_id: 'c-energy', value: '3' }],
      'appetite'
    );
    expect(hasSaved).toBe(false);
  });
});

describe('buildAppetiteTrend', () => {
  const measurements = [
    { category_id: 'c-hunger', value: '8', entry_date: '2026-11-02' },
    { category_id: 'c-fullness', value: '3', entry_date: '2026-11-02' },
    {
      category_id: 'c-hunger',
      value: '2',
      entry_date: '2026-11-01T00:00:00.000Z',
    },
    { category_id: 'c-other', value: '80', entry_date: '2026-11-01' },
    { category_id: 'c-noise', value: 'x', entry_date: '2026-11-03' },
  ];
  const nutrition = [
    { date: '2026-11-01', calories: 1800 },
    { date: '2026-11-02', calories: 2600 },
    { date: '2026-11-04', calories: 0 },
  ];

  it('joins scores and calories per day, oldest first', () => {
    expect(buildAppetiteTrend(categories, measurements, nutrition)).toEqual([
      {
        date: '2026-11-01',
        hunger: 2,
        fullness: null,
        food_noise: null,
        energy: null,
        calories: 1800,
      },
      {
        date: '2026-11-02',
        hunger: 8,
        fullness: 3,
        food_noise: null,
        energy: null,
        calories: 2600,
      },
    ]);
  });

  it('is empty without any score, so the report shows nothing', () => {
    expect(buildAppetiteTrend(categories, [], nutrition)).toEqual([]);
    expect(buildAppetiteTrend([], measurements, nutrition)).toEqual([]);
  });

  it('compares calories on hungrier and less hungry days', () => {
    const summary = summarizeAppetiteTrend(
      buildAppetiteTrend(categories, measurements, nutrition)
    );
    expect(summary).toEqual({
      daysLogged: 2,
      averageHunger: 5,
      averageFullness: 3,
      averageCravings: null,
      caloriesOnHungrierDays: 2600,
      caloriesOnLessHungryDays: 1800,
    });
  });

  it('draws no calorie comparison from one side only', () => {
    const summary = summarizeAppetiteTrend([
      {
        date: '2026-11-01',
        hunger: 4,
        fullness: null,
        food_noise: null,
        energy: null,
        calories: 2000,
      },
    ]);
    expect(summary.caloriesOnHungrierDays).toBeNull();
    expect(summary.caloriesOnLessHungryDays).toBeNull();
  });
});
