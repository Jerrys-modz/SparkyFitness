/**
 * Locks in the pace definition used by the lap table.
 *
 * This app's lap table uses Garmin's column names ("Avg Pace" / "Avg Moving
 * Pace") and its LapDTO mirrors Garmin Connect's lapDTO shape, so it follows
 * Garmin's definitions — note these are the opposite way round from Strava's
 * labels, where "Average Pace" is the moving-time one:
 *
 *   Garmin  Avg Pace        = distance / total time   (stops included)
 *           Avg Moving Pace = distance / moving time  (stops excluded)
 *   Strava  Average Pace         = distance / moving time
 *           Average Elapsed Pace = distance / elapsed time
 *
 * Both are distance over time. The bug this replaces converted `avg_speed_mps`
 * — the mean of the instantaneous GPS sample speeds — which is neither, and
 * could not be reconciled with the distance and time shown in the same row.
 */

import { paceMinPerUnit } from '@/utils/activityReportUtil';

describe('paceMinPerUnit — distance over time, per Garmin', () => {
  it('computes a lap pace that reconciles with the row it is shown in', () => {
    // Real lap from a synced Apple Health walk: 1.08 km over 22:18 (1338 s).
    // The old mean-of-samples formula rendered 16:20 for this row.
    expect(paceMinPerUnit(1.08, 1338)).toBeCloseTo(20.65, 2); // 20:39
  });

  it('gives a faster moving pace than total pace for the same distance', () => {
    const total = paceMinPerUnit(1.03, 1430);
    const moving = paceMinPerUnit(1.03, 1197);
    expect(total).toBeCloseTo(23.14, 2); // 23:08
    expect(moving).toBeCloseTo(19.37, 2); // 19:22
    expect(moving).toBeLessThan(total);
  });

  it('weights the totals row by distance, not by lap count', () => {
    // A 1.08 km lap at 1338 s and a 0.01 km lap at 84 s.
    // Distance-weighted: 1.09 km over 1422 s = 21.74 min/km.
    // Mean of the two lap paces would be (20.65 + 140.0) / 2 = 80.3 — absurd,
    // and the shape of the bug that made the totals row read 27:06.
    const weighted = paceMinPerUnit(1.08 + 0.01, 1338 + 84);
    expect(weighted).toBeCloseTo(21.74, 2);

    const meanOfPaces =
      (paceMinPerUnit(1.08, 1338) + paceMinPerUnit(0.01, 84)) / 2;
    expect(meanOfPaces).toBeGreaterThan(weighted * 2);
  });

  it('is unit-agnostic — the caller passes distance already converted', () => {
    // Same 20:39 pace expressed per mile is numerically larger per unit.
    expect(paceMinPerUnit(1, 600)).toBe(10);
    expect(paceMinPerUnit(2, 600)).toBe(5);
  });

  it('returns 0 for missing or nonsensical inputs rather than Infinity/NaN', () => {
    expect(paceMinPerUnit(0, 600)).toBe(0); // no distance → indoor entry
    expect(paceMinPerUnit(1.03, 0)).toBe(0); // no moving time recorded
    expect(paceMinPerUnit(-1, 600)).toBe(0);
    expect(paceMinPerUnit(1.03, -5)).toBe(0);
    expect(paceMinPerUnit(NaN, 600)).toBe(0);
    expect(paceMinPerUnit(1.03, NaN)).toBe(0);
  });
});
