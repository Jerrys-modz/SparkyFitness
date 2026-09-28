import i18n, { initializeI18n } from '../../src/localization/i18n';
import { buildCaloriesTooltipText } from '../../src/components/CaloriesBarChart';
import type { CaloriesStackDay } from '../../src/components/charts/caloriesStackLayout';

const day: CaloriesStackDay = {
  day: '2026-06-03',
  totalCalories: 1850,
  segments: [
    { macro: 'carbs', calories: 1000 },
    { macro: 'fat', calories: 592 },
    { macro: 'protein', calories: 258 },
  ],
};

describe('CaloriesBarChart buildCaloriesTooltipText (locale-aware)', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  test('formats the day total with the date when no segment is selected', async () => {
    await i18n.changeLanguage('en');

    const text = buildCaloriesTooltipText(day, undefined, i18n.t);

    expect(text).toContain('1,850');
    expect(text).toContain('kcal');
    expect(text).toContain('Jun 3');
    expect(text).not.toMatch(/%/);
  });

  test('adds the pressed macro’s share of the day when a segment is selected', () => {
    const text = buildCaloriesTooltipText(day, day.segments[1], i18n.t);

    // 592 / 1850 = 32%
    expect(text).toContain('1,850');
    expect(text).toContain('32%');
    expect(text).toContain('Fat');
    expect(text).toContain('Jun 3');
  });

  test('returns empty copy for no selection', () => {
    expect(buildCaloriesTooltipText(undefined, undefined, i18n.t)).toBe('');
  });
});
