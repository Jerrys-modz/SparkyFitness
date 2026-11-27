import type { RunningEstimatesResponse } from '@workspace/shared';

// Estimated VO2 max write-back: the run-based estimate (never a watch reading),
// written to Health Connect (Android) and Apple Health (iOS), one record per run
// day. Pure rules shared by both platform writers (healthconnect/vo2Writeback.ts,
// healthkit/vo2Writeback.ts).
//
// The app also READS VO2 max back from both stores, so a record it writes would
// return as a device reading and stand in for a measurement. Each record carries
// a marker the read side skips, as body write-back does, matched by marker and
// never by package or bundle id (the dev seed tool writes from this app too).

/** Start of every Health Connect clientRecordId VO2 max write-back writes. */
export const VO2_CLIENT_RECORD_PREFIX = 'sparky-vo2-';

/** Metadata key on every Apple Health sample VO2 max write-back saves. */
export const VO2_WRITEBACK_METADATA_KEY = 'SparkyVo2MaxWriteback';

/** Plausible VO2 max (ml/kg/min) for a record; anything else is not written. */
const MIN_VO2_MAX = 10;
const MAX_VO2_MAX = 100;

/** The estimate's value per run day, from the server's `vo2Max.series`. */
export const vo2SeriesByDay = (
  estimate: RunningEstimatesResponse['vo2Max'] | null | undefined
): Map<string, number> => {
  const byDay = new Map<string, number>();
  for (const point of estimate?.series ?? []) {
    if (
      Number.isFinite(point.value) &&
      point.value >= MIN_VO2_MAX &&
      point.value <= MAX_VO2_MAX
    ) {
      byDay.set(point.day, point.value);
    }
  }
  return byDay;
};

/**
 * True when another app already holds a VO2 max for the day. An estimate is
 * never put beside a measurement, so a day with any reading of another app is
 * skipped.
 */
export const hasOtherAppVo2Reading = (others: readonly number[]): boolean =>
  others.some((value) => Number.isFinite(value) && value > 0);
