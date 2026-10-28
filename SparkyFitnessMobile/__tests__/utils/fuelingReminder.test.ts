import {
  MAX_SCHEDULED_FUELING_REMINDERS,
  MIN_FUELING_LEAD_MS,
  fuelingReminderTimes,
} from '../../src/utils/fuelingReminder';

const at = (hours: number, minutes = 0) =>
  new Date(2026, 9, 27, hours, minutes, 0, 0);

describe('fuelingReminderTimes', () => {
  it('puts each reminder at its offset after the start', () => {
    const times = fuelingReminderTimes({
      startAt: at(7),
      offsetsMin: [30, 60, 90],
      now: at(6),
    });
    expect(times).toEqual([at(7, 30), at(8), at(8, 30)]);
  });

  it('drops reminders already behind now', () => {
    const times = fuelingReminderTimes({
      startAt: at(7),
      offsetsMin: [30, 60, 90],
      now: at(7, 45),
    });
    expect(times).toEqual([at(8), at(8, 30)]);
  });

  it('drops a reminder due inside the minimum lead', () => {
    const now = at(7, 30);
    const times = fuelingReminderTimes({
      startAt: at(7),
      offsetsMin: [30, 60],
      now: new Date(now.getTime() - MIN_FUELING_LEAD_MS + 1000),
    });
    expect(times).toEqual([at(8)]);
  });

  it('sorts offsets and ignores invalid ones', () => {
    const times = fuelingReminderTimes({
      startAt: at(7),
      offsetsMin: [60, Number.NaN, -5, 30],
      now: at(6),
    });
    expect(times).toEqual([at(7, 30), at(8)]);
  });

  it('caps a very long plan', () => {
    const offsets = Array.from({ length: 100 }, (_, i) => (i + 1) * 10);
    const times = fuelingReminderTimes({
      startAt: at(7),
      offsetsMin: offsets,
      now: at(6),
    });
    expect(times).toHaveLength(MAX_SCHEDULED_FUELING_REMINDERS);
  });

  it('returns nothing for an invalid start', () => {
    expect(
      fuelingReminderTimes({
        startAt: new Date(Number.NaN),
        offsetsMin: [30],
        now: at(6),
      })
    ).toEqual([]);
  });
});
