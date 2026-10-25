import type { CalorieMaintenancePeriod } from '../schemas/api/CalorieMaintenancePeriods.api.zod.ts';

/**
 * The refeed day or diet break that covers `day` (YYYY-MM-DD), or null. Both
 * ends are included. When periods overlap, the one that started last wins, so
 * a refeed inside a break is reported as the refeed. Either way the day's
 * calorie target is worked out with Goal Mode set to Maintain.
 */
export function maintenancePeriodOnDay(
  periods: readonly Pick<
    CalorieMaintenancePeriod,
    'kind' | 'start_date' | 'end_date'
  >[],
  day: string
): (typeof periods)[number] | null {
  let found: (typeof periods)[number] | null = null;
  for (const period of periods) {
    if (period.start_date > day || period.end_date < day) continue;
    if (found === null || period.start_date >= found.start_date) {
      found = period;
    }
  }
  return found;
}
