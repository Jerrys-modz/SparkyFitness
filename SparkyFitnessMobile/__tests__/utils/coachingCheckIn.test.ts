import {
  coachingSuggestionSignature,
  nextCoachingReminderTime,
} from '../../src/utils/coachingCheckIn';

describe('nextCoachingReminderTime', () => {
  // 2026-10-17 is a Saturday.
  const saturdayNoon = new Date(2026, 9, 17, 12, 0);

  it('lands on the next chosen weekday at 09:00', () => {
    const time = nextCoachingReminderTime(saturdayNoon, 1);
    expect(time).toEqual(new Date(2026, 9, 19, 9, 0));
    expect(time.getDay()).toBe(1);
  });

  it('uses later today when the hour has not passed yet', () => {
    const morning = new Date(2026, 9, 17, 7, 30);
    expect(nextCoachingReminderTime(morning, 6)).toEqual(
      new Date(2026, 9, 17, 9, 0)
    );
  });

  it('moves a week on when today’s hour has passed', () => {
    expect(nextCoachingReminderTime(saturdayNoon, 6)).toEqual(
      new Date(2026, 9, 24, 9, 0)
    );
  });

  it('is strictly in the future at exactly 09:00', () => {
    const exactly = new Date(2026, 9, 17, 9, 0);
    expect(nextCoachingReminderTime(exactly, 6).getTime()).toBeGreaterThan(
      exactly.getTime()
    );
  });

  it('crosses a month and year boundary by calendar day', () => {
    const newYearsEve = new Date(2026, 11, 31, 12, 0); // Thursday
    expect(nextCoachingReminderTime(newYearsEve, 0)).toEqual(
      new Date(2027, 0, 3, 9, 0)
    );
  });
});

describe('coachingSuggestionSignature', () => {
  it('changes with the day and the suggested calories', () => {
    const a = coachingSuggestionSignature('2026-10-17', 1800);
    expect(a).toBe(coachingSuggestionSignature('2026-10-17', 1800));
    expect(a).not.toBe(coachingSuggestionSignature('2026-10-24', 1800));
    expect(a).not.toBe(coachingSuggestionSignature('2026-10-17', 1790));
  });
});
