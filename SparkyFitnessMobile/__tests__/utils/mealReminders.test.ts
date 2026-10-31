import {
  MAX_MEAL_REMINDERS,
  MEAL_REMINDER_LOOKAHEAD_DAYS,
  computeMealReminderSchedule,
  normalizeMealReminders,
} from '../../src/utils/mealReminders';

describe('normalizeMealReminders', () => {
  it('drops invalid times, empty ids and duplicate meal types, then sorts', () => {
    expect(
      normalizeMealReminders([
        { mealTypeId: 'dinner', time: '18:30' },
        { mealTypeId: 'breakfast', time: '08:00' },
        { mealTypeId: 'breakfast', time: '09:00' },
        { mealTypeId: 'lunch', time: '9:5' },
        { mealTypeId: '', time: '12:00' },
        { mealTypeId: 'snack', time: '24:00' },
      ])
    ).toEqual([
      { mealTypeId: 'breakfast', time: '08:00' },
      { mealTypeId: 'dinner', time: '18:30' },
    ]);
  });

  it('caps the list', () => {
    const many = Array.from({ length: MAX_MEAL_REMINDERS + 3 }, (_, i) => ({
      mealTypeId: `m${i}`,
      time: `${String(i).padStart(2, '0')}:00`,
    }));
    expect(normalizeMealReminders(many)).toHaveLength(MAX_MEAL_REMINDERS);
  });
});

describe('computeMealReminderSchedule', () => {
  const reminders = [
    { mealTypeId: 'breakfast', time: '08:00' },
    { mealTypeId: 'lunch', time: '12:30' },
    { mealTypeId: 'dinner', time: '18:30' },
  ];

  it('skips logged meals today but keeps them on later days', () => {
    const now = new Date(2026, 9, 31, 7, 0);
    const schedule = computeMealReminderSchedule({
      reminders,
      loggedMealTypeIds: new Set(['lunch']),
      now,
    });
    const today = schedule.filter((s) => s.date.getDate() === 31);
    expect(today.map((s) => s.mealTypeId)).toEqual(['breakfast', 'dinner']);
    expect(schedule.filter((s) => s.mealTypeId === 'lunch')).toHaveLength(
      MEAL_REMINDER_LOOKAHEAD_DAYS - 1
    );
  });

  it('drops reminders already past or due within a minute', () => {
    const now = new Date(2026, 9, 31, 12, 29, 30);
    const schedule = computeMealReminderSchedule({
      reminders,
      loggedMealTypeIds: new Set(),
      now,
    });
    const today = schedule.filter((s) => s.date.getDate() === 31);
    expect(today.map((s) => s.mealTypeId)).toEqual(['dinner']);
  });

  it('rolls over month ends and keeps wall-clock time', () => {
    const now = new Date(2026, 9, 31, 19, 0);
    const schedule = computeMealReminderSchedule({
      reminders: [{ mealTypeId: 'breakfast', time: '08:00' }],
      loggedMealTypeIds: new Set(),
      now,
    });
    expect(schedule.map((s) => [s.date.getMonth(), s.date.getDate()])).toEqual([
      [10, 1],
      [10, 2],
    ]);
    expect(schedule.every((s) => s.date.getHours() === 8)).toBe(true);
  });

  it('returns nothing with no reminders', () => {
    expect(
      computeMealReminderSchedule({
        reminders: [],
        loggedMealTypeIds: new Set(),
        now: new Date(),
      })
    ).toEqual([]);
  });
});
