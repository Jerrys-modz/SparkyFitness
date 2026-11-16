import {
  computeWeighInReminderSlots,
  DEFAULT_WEIGH_IN_REMINDER_TIME,
  normalizeWeighInReminderTime,
  normalizeWeighInReminderWeekdays,
  WEIGH_IN_REMINDER_LOOKAHEAD_DAYS,
} from '../../src/utils/weighInReminder';

const ALL = [0, 1, 2, 3, 4, 5, 6];
// 2026-11-16 is a Monday.
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

describe('computeWeighInReminderSlots', () => {
  it('schedules every day of the window when today is still ahead', () => {
    const slots = computeWeighInReminderSlots({
      now: new Date(2026, 10, 16, 6, 0),
      today: MONDAY,
      time: '07:30',
      weekdays: ALL,
      skipDay: null,
    });
    expect(slots).toHaveLength(WEIGH_IN_REMINDER_LOOKAHEAD_DAYS);
    expect(slots[0]).toEqual({
      offset: 0,
      day: MONDAY,
      at: new Date(2026, 10, 16, 7, 30),
    });
    expect(slots[6].day).toBe('2026-11-22');
  });

  it('leaves out a time already past today', () => {
    const slots = computeWeighInReminderSlots({
      now: new Date(2026, 10, 16, 9, 0),
      today: MONDAY,
      time: '07:30',
      weekdays: ALL,
      skipDay: null,
    });
    expect(slots.map((s) => s.offset)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('leaves out the skipped day once a weight is logged', () => {
    const slots = computeWeighInReminderSlots({
      now: new Date(2026, 10, 16, 6, 0),
      today: MONDAY,
      time: '07:30',
      weekdays: ALL,
      skipDay: MONDAY,
    });
    expect(slots.map((s) => s.day)).not.toContain(MONDAY);
    expect(slots).toHaveLength(WEIGH_IN_REMINDER_LOOKAHEAD_DAYS - 1);
  });

  it('only uses the selected weekdays (weekly on Monday)', () => {
    const slots = computeWeighInReminderSlots({
      now: new Date(2026, 10, 16, 9, 0),
      today: MONDAY,
      time: '07:30',
      weekdays: [1],
      skipDay: null,
      lookaheadDays: 15,
    });
    expect(slots.map((s) => s.day)).toEqual(['2026-11-23', '2026-11-30']);
  });

  it('schedules nothing without weekdays', () => {
    expect(
      computeWeighInReminderSlots({
        now: new Date(2026, 10, 16, 6, 0),
        today: MONDAY,
        time: '07:30',
        weekdays: [],
        skipDay: null,
      })
    ).toEqual([]);
  });
});
