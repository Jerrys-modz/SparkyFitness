/** A HealthKit stand-hour sample: `0` is an hour stood in, `1` an idle hour. */
export type StandHourSample = { value: number; startDate: Date | string };

/**
 * Hours stood in, as Apple counts them for the Stand ring: an hour in which the person
 * stood and moved for at least a minute. Idle hours are not counted, and an hour recorded
 * twice (two sources) counts once, so a ring never passes the 24 hours a day holds.
 */
export function countStandHours(samples: readonly StandHourSample[]): number {
  const hours = new Set<number>();
  for (const sample of samples) {
    if (sample.value !== 0) continue;
    const start = new Date(sample.startDate).getTime();
    if (Number.isNaN(start)) continue;
    hours.add(Math.floor(start / 3_600_000));
  }
  return hours.size;
}
