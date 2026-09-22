import { buildWorkoutContributionGrid } from '@/utils/workoutHeatmap';

describe('buildWorkoutContributionGrid', () => {
  const today = new Date(2026, 8, 22); // Tuesday Sep 22 2026

  it('builds week columns instead of twelve month calendars', () => {
    const grid = buildWorkoutContributionGrid({
      workoutDates: ['2026-09-22', '2026-09-20'],
      today,
      firstDayOfWeek: 0,
    });

    expect(grid.weeks.length).toBeGreaterThanOrEqual(52);
    expect(grid.weeks.length).toBeLessThanOrEqual(54);
    expect(grid.weeks.every((week) => week.days.length === 7)).toBe(true);
    expect(grid.weekdayKeys).toEqual([
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ]);
  });

  it('fits the selected report range instead of twelve months', () => {
    const grid = buildWorkoutContributionGrid({
      workoutDates: ['2026-09-16', '2026-09-22'],
      today,
      firstDayOfWeek: 1,
      startDate: '2026-09-08',
      endDate: '2026-09-22',
    });

    expect(grid.weeks.length).toBeGreaterThanOrEqual(2);
    expect(grid.weeks.length).toBeLessThanOrEqual(4);
    const keys = grid.weeks.flatMap((week) => week.days.map((d) => d.dayKey));
    expect(keys).toContain('2026-09-08');
    expect(keys).toContain('2026-09-22');
    expect(keys).not.toContain('2026-01-15');
  });

  it('marks workout days and leaves empty days unmarked', () => {
    const grid = buildWorkoutContributionGrid({
      workoutDates: ['2026-09-22'],
      today,
      firstDayOfWeek: 0,
    });
    const cells = grid.weeks.flatMap((week) => week.days);
    const workout = cells.find((cell) => cell.dayKey === '2026-09-22');
    const rest = cells.find((cell) => cell.dayKey === '2026-09-21');

    expect(workout?.hasWorkout).toBe(true);
    expect(rest?.hasWorkout).toBe(false);
  });

  it('labels a week when it contains the first of a month', () => {
    const grid = buildWorkoutContributionGrid({
      workoutDates: [],
      today,
      firstDayOfWeek: 0,
      monthLabel: (date) => date.toLocaleString('en-US', { month: 'short' }),
    });
    const september = grid.weeks.find((week) => week.monthLabel === 'Sep');
    expect(september).toBeDefined();
  });

  it('labels the first week of a short range even without the 1st', () => {
    const grid = buildWorkoutContributionGrid({
      workoutDates: [],
      today,
      firstDayOfWeek: 1,
      startDate: '2026-09-08',
      endDate: '2026-09-22',
      monthLabel: (date) => date.toLocaleString('en-US', { month: 'short' }),
    });
    expect(grid.weeks[0]?.monthLabel).toBe('Sep');
  });

  it('respects a Monday week start', () => {
    const grid = buildWorkoutContributionGrid({
      workoutDates: [],
      today,
      firstDayOfWeek: 1,
    });
    expect(grid.weekdayKeys[0]).toBe('monday');
    expect(grid.weeks[0]?.days[0]?.date.getDay()).toBe(1);
  });
});
