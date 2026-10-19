import {
  HEART_RATE_BAND_HIGHEST_BPM,
  HEART_RATE_BAND_LOWEST_BPM,
  normalizeHeartRateBand,
  type HeartRateBand,
} from "./heartRateTargets.ts";

/**
 * Heart-rate zones as a share of maximum heart rate: five zones, the split the
 * Garmin, Polar and Strava defaults share. `heartRateZoneRange` is the one
 * place that turns a zone number into bpm, so a person's own zone settings
 * (a measured maximum, a resting rate, another method) only have to change
 * what it is given or how it reads the floors.
 */
export type HeartRateZone = 1 | 2 | 3 | 4 | 5;

/** Floor of each zone as a fraction of maximum heart rate. Zone 2 is 60 to 70 percent. */
export const HEART_RATE_ZONE_FLOORS = [0.5, 0.6, 0.7, 0.8, 0.9] as const;

/**
 * Maximum heart rate from age, by the Nes et al. (2013) formula, the same one
 * the server uses for time in zone (`estimateMaxHrFromAge` in hrZoneCalculator). It holds up
 * better than `220 - age`, which overestimates for young adults and
 * underestimates for older ones. A population estimate: a measured maximum is
 * better.
 */
export function estimateMaxHrFromAge(age: number): number {
  return Math.round(211 - 0.64 * age);
}

/**
 * The bpm range of `zone` for someone with `maxHr`: from the zone's floor up
 * to one below the next zone's floor, and for zone 5 up to the maximum. Null
 * when the maximum is not a usable number or the range falls outside what a
 * heart-rate target can hold.
 */
export function heartRateZoneRange(
  maxHr: number,
  zone: HeartRateZone,
): HeartRateBand | null {
  if (!Number.isFinite(maxHr) || maxHr <= 0) return null;
  const floors: readonly number[] = HEART_RATE_ZONE_FLOORS;
  const floor = floors[zone - 1];
  const next = floors[zone];
  if (floor === undefined) return null;
  return normalizeHeartRateBand({
    minBpm: Math.round(maxHr * floor),
    maxBpm:
      next === undefined ? Math.round(maxHr) : Math.round(maxHr * next) - 1,
  });
}

/** Zone 2, the easy aerobic range the Zone 2 program holds its runs to. */
export const zone2HeartRateRange = (maxHr: number): HeartRateBand | null =>
  heartRateZoneRange(maxHr, 2);

/**
 * Zone 2 for someone of this age, or null when the age is not believable.
 * Where the Zone 2 program's range comes from today; the single place to read
 * a person's own maximum or zones from once they can be set.
 */
export function zone2HeartRateRangeForAge(age: number): HeartRateBand | null {
  if (!Number.isFinite(age) || age < 10 || age > 100) return null;
  return zone2HeartRateRange(estimateMaxHrFromAge(age));
}

/** How far past Zone 2's top edge heart rate may drift on a long steady run. */
export const ZONE2_DRIFT_MAX_BPM = 5;
/** Drift is not allowed for before this long into a Zone 2 stretch... */
export const ZONE2_DRIFT_START_SECONDS = 20 * 60;
/** ...and reaches its full allowance by this long. */
export const ZONE2_DRIFT_FULL_SECONDS = 60 * 60;
/** Heart rate lags effort, so the first minutes of a stretch may sit this far under the range. */
export const ZONE2_SETTLE_SECONDS = 3 * 60;
export const ZONE2_SETTLE_BPM = 10;

/**
 * The range a Zone 2 stretch is judged against `secondsIn` seconds after it
 * began. Heart rate climbs slowly at the start of a run and drifts up on a long
 * steady one (heat, fluid loss) with no change in effort, so the lower edge is
 * relaxed while it settles and the upper edge grows by up to five bpm between
 * 20 and 60 minutes. The displayed target stays the plain Zone 2 range.
 */
export function zone2LiveBand(
  band: HeartRateBand,
  secondsIn: number,
): HeartRateBand {
  const elapsed = Math.max(0, secondsIn);
  const drift =
    elapsed <= ZONE2_DRIFT_START_SECONDS
      ? 0
      : Math.min(
          1,
          (elapsed - ZONE2_DRIFT_START_SECONDS) /
            (ZONE2_DRIFT_FULL_SECONDS - ZONE2_DRIFT_START_SECONDS),
        ) * ZONE2_DRIFT_MAX_BPM;
  const settle = elapsed < ZONE2_SETTLE_SECONDS ? ZONE2_SETTLE_BPM : 0;
  return {
    minBpm: Math.max(HEART_RATE_BAND_LOWEST_BPM, band.minBpm - settle),
    maxBpm: Math.min(
      HEART_RATE_BAND_HIGHEST_BPM,
      band.maxBpm + Math.round(drift),
    ),
  };
}

export type HeartRateStanding = "above" | "below" | "inside";

/** Where a reading sits against a range; no margin, the alert rule adds its own. */
export function heartRateStanding(
  bpm: number,
  band: HeartRateBand,
): HeartRateStanding {
  if (bpm > band.maxBpm) return "above";
  if (bpm < band.minBpm) return "below";
  return "inside";
}
