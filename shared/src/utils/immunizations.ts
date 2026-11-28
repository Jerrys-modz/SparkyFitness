import { addDays, compareDays } from './timezone.ts';

/** How many days ahead a next-due date counts as "due soon". */
export const IMMUNIZATION_DUE_SOON_DAYS = 30;

export type ImmunizationDueStatus =
  'overdue' | 'due_soon' | 'upcoming' | 'none';

/**
 * Where a vaccine's next-due date stands against `today` (a `YYYY-MM-DD` day in
 * the person's zone). A date before today is overdue, one within
 * `IMMUNIZATION_DUE_SOON_DAYS` is due soon, and none means nothing is due.
 * Web and mobile both label records with this, never their own date maths.
 */
export function immunizationDueStatus(
  nextDueOn: string | null | undefined,
  today: string
): ImmunizationDueStatus {
  if (!nextDueOn) return 'none';
  if (compareDays(nextDueOn, today) < 0) return 'overdue';
  if (compareDays(nextDueOn, addDays(today, IMMUNIZATION_DUE_SOON_DAYS)) <= 0) {
    return 'due_soon';
  }
  return 'upcoming';
}

/**
 * Common vaccine names, offered as suggestions when logging one. Only a hint:
 * a record keeps whatever name the person types, and the names are English
 * display text that each app may translate.
 */
export const COMMON_VACCINE_NAMES = [
  'COVID-19',
  'Influenza (flu)',
  'Tdap',
  'Td',
  'MMR',
  'Varicella (chickenpox)',
  'Hepatitis A',
  'Hepatitis B',
  'HPV',
  'Pneumococcal',
  'Shingles (zoster)',
  'RSV',
  'Meningococcal',
  'Polio',
  'Typhoid',
  'Yellow fever',
  'Rabies',
] as const;
