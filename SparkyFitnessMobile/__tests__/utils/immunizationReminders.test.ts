import {
  IMMUNIZATION_REMINDER_HOUR,
  MAX_IMMUNIZATION_REMINDER_RECORDS,
  immunizationReminderFireAt,
  planImmunizationReminders,
} from '../../src/utils/immunizationReminders';

const record = (id: string, next_due_on: string | null, name = 'Tdap') => ({
  id,
  vaccine_name: name,
  next_due_on,
});

describe('planImmunizationReminders', () => {
  const today = '2026-11-28';

  it('plans a reminder a week ahead and one on the due day', () => {
    expect(
      planImmunizationReminders([record('a', '2026-12-20')], today)
    ).toEqual([
      {
        identifier: 'immunization_a_ahead',
        recordId: 'a',
        vaccineName: 'Tdap',
        when: 'ahead',
        day: '2026-12-13',
      },
      {
        identifier: 'immunization_a_due',
        recordId: 'a',
        vaccineName: 'Tdap',
        when: 'due',
        day: '2026-12-20',
      },
    ]);
  });

  it('skips the early reminder when its day has passed but keeps the due day', () => {
    const plan = planImmunizationReminders([record('a', '2026-12-02')], today);
    expect(plan.map((item) => item.when)).toEqual(['due']);
  });

  it('keeps a vaccine due today, and plans nothing for an overdue one or one without a date', () => {
    const plan = planImmunizationReminders(
      [
        record('today', today),
        record('late', '2026-11-01'),
        record('none', null),
      ],
      today
    );
    expect(plan.map((item) => item.recordId)).toEqual(['today']);
  });

  it('plans only the nearest vaccines, soonest first', () => {
    const records = Array.from(
      { length: MAX_IMMUNIZATION_REMINDER_RECORDS + 5 },
      (_, index) =>
        record(
          `r${index}`,
          `2027-${String((index % 9) + 1).padStart(2, '0')}-15`
        )
    );
    const plan = planImmunizationReminders(records, today);
    const ids = new Set(plan.map((item) => item.recordId));
    expect(ids.size).toBe(MAX_IMMUNIZATION_REMINDER_RECORDS);
    const days = plan.filter((i) => i.when === 'due').map((i) => i.day);
    expect([...days].sort()).toEqual(days);
  });
});

describe('immunizationReminderFireAt', () => {
  it('is the reminder hour on that local day', () => {
    const at = immunizationReminderFireAt('2026-12-20');
    expect(at.getFullYear()).toBe(2026);
    expect(at.getMonth()).toBe(11);
    expect(at.getDate()).toBe(20);
    expect(at.getHours()).toBe(IMMUNIZATION_REMINDER_HOUR);
    expect(at.getMinutes()).toBe(0);
  });
});
