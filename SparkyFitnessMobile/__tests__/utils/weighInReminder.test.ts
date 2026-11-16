import {
  DEFAULT_WEIGH_IN_REMINDER_TIME,
  normalizeWeighInReminderTime,
  normalizeWeighInReminderWeekdays,
  planWeighInReminders,
  WEIGH_IN_SKIP_FALLBACK_WEEKS,
} from '../../src/utils/weighInReminder';

const ALL = [0, 1, 2, 3, 4, 5, 6];
// 2026-11-16 is a Monday (weekday 1).
const MONDAY = '2026-11-16';

describe('normalizeWeighInReminderTime', () => {
  it('keeps a valid HH:MM and falls back to the default otherwise', () => {
    expect(normalizeWeighInReminderTime('06:45')).toBe('06:45');
    expect(normalizeWeighInReminderTime('7:5')).toBe(
      DEFAULT_WEIGH_IN_REMINDER_TIME
    );
    expect(normalizeWeighInReminderTime('24:00')).toBe(
      DEFAULT_WEIGH_IN_REMINDER_TIME
    );
  });
});

describe('normalizeWeighInReminderWeekdays', () => {
  it('drops invalid days, de-duplicates and sorts', () => {
    expect(normalizeWeighInReminderWeekdays([5, 1, 1, 7, -1, 2.5, 0])).toEqual([
      0, 1, 5,
    ]);
  });

  it('may return an empty list', () => {
    expect(normalizeWeighInReminderWeekdays([])).toEqual([]);
  });
});

describe('planWeighInReminders', () => {
  it('repeats weekly on every selected day when nothing is skipped', () => {
    expect(
      planWeighInReminders({
        today: MONDAY,
        time: '07:30',
        weekdays: ALL,
        skipToday: false,
      })
    ).toEqual({ hour: 7, minute: 30, weekly: ALL, oneShots: [] });
  });

  it("swaps today's weekday for one-shots on the following weeks after a skip", () => {
    const plan = planWeighInReminders({
      today: MONDAY,
      time: '07:30',
      weekdays: ALL,
      skipToday: true,
    });
    expect(plan.weekly).toEqual([0, 2, 3, 4, 5, 6]);
    expect(plan.oneShots).toHaveLength(WEIGH_IN_SKIP_FALLBACK_WEEKS);
    expect(plan.oneShots[0]).toEqual({
      week: 1,
      day: '2026-11-23',
      at: new Date(2026, 10, 23, 7, 30),
    });
    expect(plan.oneShots[1].day).toBe('2026-11-30');
  });

  it('weekly on Monday only: a skip keeps the following Mondays', () => {
    const plan = planWeighInReminders({
      today: MONDAY,
      time: '06:00',
      weekdays: [1],
      skipToday: true,
      fallbackWeeks: 2,
    });
    expect(plan.weekly).toEqual([]);
    expect(plan.oneShots.map((o) => o.day)).toEqual([
      '2026-11-23',
      '2026-11-30',
    ]);
  });

  it('ignores a skip when today is not a reminder day', () => {
    const plan = planWeighInReminders({
      today: MONDAY,
      time: '07:30',
      weekdays: [3, 5],
      skipToday: true,
    });
    expect(plan.weekly).toEqual([3, 5]);
    expect(plan.oneShots).toEqual([]);
  });

  it('plans nothing without weekdays', () => {
    expect(
      planWeighInReminders({
        today: MONDAY,
        time: '07:30',
        weekdays: [],
        skipToday: false,
      })
    ).toEqual({ hour: 7, minute: 30, weekly: [], oneShots: [] });
  });
});
