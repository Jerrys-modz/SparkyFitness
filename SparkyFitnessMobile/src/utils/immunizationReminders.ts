import {
  addDays,
  compareDays,
  type ImmunizationResponse,
} from '@workspace/shared';

/** The hour (local) a vaccine reminder is sent. */
export const IMMUNIZATION_REMINDER_HOUR = 9;
/** How many days before the due date the early reminder is sent. */
export const IMMUNIZATION_REMINDER_LEAD_DAYS = 7;
/**
 * At most this many vaccines are planned at once: the nearest ones, so the two
 * reminders each stay well inside iOS's limit of 64 scheduled notifications
 * for the whole app.
 */
export const MAX_IMMUNIZATION_REMINDER_RECORDS = 15;
export const IMMUNIZATION_REMINDER_KIND = 'immunization-due';

export interface ImmunizationReminderPlanItem {
  /** Stable per record and kind, so a rebuilt plan replaces what it scheduled. */
  identifier: string;
  recordId: string;
  vaccineName: string;
  /** `due` is the due day itself, `ahead` the early reminder. */
  when: 'due' | 'ahead';
  /** The `YYYY-MM-DD` day it is sent. */
  day: string;
}

export const immunizationReminderIdentifier = (
  recordId: string,
  when: 'due' | 'ahead'
): string => `immunization_${recordId}_${when}`;

/**
 * Which reminders to schedule for the person's records, from `today` (a day in
 * their zone). Only records with a next-due date count, and only reminders on
 * a day that has not passed; the due day's reminder still goes out on the day
 * (its time is checked when it is scheduled). An overdue vaccine gets none: it
 * has already been announced and is marked on the list.
 */
export function planImmunizationReminders(
  records: readonly Pick<
    ImmunizationResponse,
    'id' | 'vaccine_name' | 'next_due_on'
  >[],
  today: string
): ImmunizationReminderPlanItem[] {
  const upcoming = records
    .filter(
      (record): record is typeof record & { next_due_on: string } =>
        record.next_due_on !== null &&
        compareDays(record.next_due_on, today) >= 0
    )
    .sort((a, b) => compareDays(a.next_due_on, b.next_due_on))
    .slice(0, MAX_IMMUNIZATION_REMINDER_RECORDS);

  return upcoming.flatMap((record) => {
    const items: ImmunizationReminderPlanItem[] = [];
    const ahead = addDays(record.next_due_on, -IMMUNIZATION_REMINDER_LEAD_DAYS);
    if (compareDays(ahead, today) >= 0) {
      items.push({
        identifier: immunizationReminderIdentifier(record.id, 'ahead'),
        recordId: record.id,
        vaccineName: record.vaccine_name,
        when: 'ahead',
        day: ahead,
      });
    }
    items.push({
      identifier: immunizationReminderIdentifier(record.id, 'due'),
      recordId: record.id,
      vaccineName: record.vaccine_name,
      when: 'due',
      day: record.next_due_on,
    });
    return items;
  });
}

/** The local moment a reminder on `day` is sent. */
export function immunizationReminderFireAt(day: string): Date {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(year, month - 1, date, IMMUNIZATION_REMINDER_HOUR, 0, 0, 0);
}
