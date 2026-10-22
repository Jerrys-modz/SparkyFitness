import { getAppLocale } from '../localization';

/** "Wed, Oct 14" (or "Wed, October 14") for a YYYY-MM-DD calendar day. */
export function formatDayLabel(
  day: string,
  month: 'long' | 'short' = 'short'
): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(getAppLocale(), {
    weekday: 'short',
    month,
    day: 'numeric',
  });
}

/** A calendar day with its year, for dates far enough out that the year matters. */
export const formatDateWithYear = (day: string): string => {
  const parts = day.split('-');
  if (parts.length < 3) return day;
  const [year, month, d] = parts.map(Number);
  const date = new Date(year, (month || 1) - 1, d || 1);
  return date.toLocaleDateString(getAppLocale(), {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

/** "Mar 2026" for a YYYY-MM-DD calendar day, for an axis that spans months. */
export function formatMonthYear(day: string): string {
  const [year, month, d] = day.split('-').map(Number);
  return new Date(year, (month || 1) - 1, d || 1).toLocaleDateString(
    getAppLocale(),
    { month: 'short', year: 'numeric' }
  );
}
