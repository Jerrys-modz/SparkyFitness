import {
  currentLoggingStreak,
  sleepMinutesForWidget,
} from '../../src/utils/widgetExtras';

const logged = (...dates: string[]) =>
  dates.map((date) => ({ date, calories: 1500 }));

describe('currentLoggingStreak', () => {
  it('counts consecutive logged days ending today', () => {
    expect(
      currentLoggingStreak(
        logged('2026-11-07', '2026-11-08', '2026-11-09'),
        '2026-11-09'
      )
    ).toBe(3);
  });

  it('does not let a still-empty today break the streak', () => {
    expect(
      currentLoggingStreak(logged('2026-11-07', '2026-11-08'), '2026-11-09')
    ).toBe(2);
  });

  it('stops at a gap', () => {
    expect(
      currentLoggingStreak(
        logged('2026-11-05', '2026-11-08', '2026-11-09'),
        '2026-11-09'
      )
    ).toBe(2);
  });

  it('treats a day with zero calories as not logged', () => {
    expect(
      currentLoggingStreak(
        [
          { date: '2026-11-08', calories: 0 },
          { date: '2026-11-09', calories: 1800 },
        ],
        '2026-11-09'
      )
    ).toBe(1);
  });

  it('is zero with nothing logged', () => {
    expect(currentLoggingStreak([], '2026-11-09')).toBe(0);
  });

  it('crosses a month boundary', () => {
    expect(
      currentLoggingStreak(
        logged('2026-10-30', '2026-10-31', '2026-11-01'),
        '2026-11-01'
      )
    ).toBe(3);
  });

  it('is capped by the window', () => {
    const days = Array.from({ length: 100 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 7, 1 + i));
      return d.toISOString().slice(0, 10);
    });
    expect(currentLoggingStreak(logged(...days), days[99], 90)).toBe(90);
  });
});

describe('sleepMinutesForWidget', () => {
  it('prefers time actually asleep', () => {
    expect(
      sleepMinutesForWidget({
        time_asleep_in_seconds: 7 * 3600,
        duration_in_seconds: 8 * 3600,
      })
    ).toBe(420);
  });

  it('falls back to the bed-to-wake span', () => {
    expect(
      sleepMinutesForWidget({
        time_asleep_in_seconds: null,
        duration_in_seconds: 8 * 3600,
      })
    ).toBe(480);
  });

  it('is null with no sleep', () => {
    expect(sleepMinutesForWidget(null)).toBeNull();
    expect(
      sleepMinutesForWidget({
        time_asleep_in_seconds: null,
        duration_in_seconds: 0,
      })
    ).toBeNull();
  });
});
