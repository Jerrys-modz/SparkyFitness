import { describe, expect, it } from 'vitest';
import {
  computeRunningEstimates,
  runningPowerWatts,
  vo2MaxFromRun,
  type RunForEstimate,
} from '@workspace/shared';

const TODAY = '2026-10-13';
const day = (offset: number) => {
  const d = new Date(`${TODAY}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
// 10 km in 50 minutes (12 km/h) at 160 bpm.
const run = (
  offset: number,
  overrides: Partial<RunForEstimate> = {}
): RunForEstimate => ({
  day: day(offset),
  distanceKm: 10,
  durationMinutes: 50,
  avgHeartRate: 160,
  elevationGainMeters: null,
  ...overrides,
});

describe('vo2MaxFromRun', () => {
  it('estimates VO2 max from pace against the share of heart rate reserve used', () => {
    // Cost 43.5 ml/kg/min at 200 m/min; reserve share 100/130.
    expect(vo2MaxFromRun(run(0), 60, 190)).toBeCloseTo(55.5, 1);
  });

  it('gives a higher figure for the same pace at a lower heart rate', () => {
    const easy = vo2MaxFromRun(run(0, { avgHeartRate: 150 }), 60, 190)!;
    const hard = vo2MaxFromRun(run(0, { avgHeartRate: 170 }), 60, 190)!;
    expect(easy).toBeGreaterThan(hard);
  });

  it('adds the cost of a climb', () => {
    const flat = vo2MaxFromRun(run(0), 60, 190)!;
    const hilly = vo2MaxFromRun(run(0, { elevationGainMeters: 300 }), 60, 190)!;
    expect(hilly).toBeGreaterThan(flat);
  });

  it('declines runs it cannot judge', () => {
    expect(vo2MaxFromRun(run(0, { avgHeartRate: null }))).toBeNull();
    expect(vo2MaxFromRun(run(0, { durationMinutes: 8 }))).toBeNull();
    // Walking pace: 5 km in 60 minutes.
    expect(
      vo2MaxFromRun(run(0, { distanceKm: 5, durationMinutes: 60 }))
    ).toBeNull();
    // Heart rate near rest, and at the maximum.
    expect(vo2MaxFromRun(run(0, { avgHeartRate: 100 }), 60, 190)).toBeNull();
    expect(vo2MaxFromRun(run(0, { avgHeartRate: 188 }), 60, 190)).toBeNull();
  });
});

describe('runningPowerWatts', () => {
  it('is the flat cost of moving the body at the average speed', () => {
    // 70 kg x 1.04 J/kg/m x 3.333 m/s.
    expect(runningPowerWatts(run(0), 70)).toBeCloseTo(242.7, 0);
  });

  it('adds the work of the climb', () => {
    const flat = runningPowerWatts(run(0), 70)!;
    const hilly = runningPowerWatts(run(0, { elevationGainMeters: 200 }), 70)!;
    // 70 x 9.81 x 200 J over 3000 s.
    expect(hilly - flat).toBeCloseTo((70 * 9.81 * 200) / 3000, 1);
  });

  it('needs a body weight and a usable run', () => {
    expect(runningPowerWatts(run(0), 0)).toBeNull();
    expect(runningPowerWatts(run(0, { durationMinutes: 5 }), 70)).toBeNull();
  });
});

describe('computeRunningEstimates', () => {
  it('takes the median over qualifying runs in the last six weeks', () => {
    const result = computeRunningEstimates(
      [
        run(-3, { avgHeartRate: 155 }),
        run(-10, { avgHeartRate: 160 }),
        run(-20, { avgHeartRate: 165 }),
        run(-60, { avgHeartRate: 120 }),
      ],
      TODAY,
      { restingHeartRate: 60, maxHeartRate: 190 }
    );
    expect(result.vo2Max?.runs).toBe(3);
    expect(result.vo2Max?.value).toBeCloseTo(55.5, 1);
    expect(result.vo2Max?.from).toBe(day(-20));
    expect(result.vo2Max?.to).toBe(day(-3));
  });

  it('lists the VO2 max per run day, oldest first, with a median for two runs on one day', () => {
    const result = computeRunningEstimates(
      [
        run(-3, { avgHeartRate: 155 }),
        run(-20, { avgHeartRate: 165 }),
        run(-3, { avgHeartRate: 165 }),
      ],
      TODAY,
      { restingHeartRate: 60, maxHeartRate: 190 }
    );
    expect(result.vo2Max?.runs).toBe(3);
    expect(result.vo2Max?.series?.map((point) => point.day)).toEqual([
      day(-20),
      day(-3),
    ]);
  });

  it('gives no VO2 max from a single run', () => {
    const result = computeRunningEstimates([run(-3)], TODAY, {
      bodyWeightKg: 70,
    });
    expect(result.vo2Max).toBeNull();
    expect(result.power?.runs).toHaveLength(1);
  });

  it('averages the power of the last four weeks, oldest first', () => {
    const result = computeRunningEstimates(
      [run(-2), run(-10), run(-40)],
      TODAY,
      { bodyWeightKg: 70 }
    );
    expect(result.power?.runs.map((r) => r.day)).toEqual([day(-10), day(-2)]);
    expect(result.power?.averageWatts).toBe(243);
    expect(result.power?.wattsPerKg).toBe(3.5);
  });

  it('leaves power out without a body weight', () => {
    const result = computeRunningEstimates([run(-2), run(-5)], TODAY);
    expect(result.power).toBeNull();
    expect(result.vo2Max).not.toBeNull();
  });

  it('returns nothing for no runs', () => {
    expect(computeRunningEstimates([], TODAY)).toEqual({
      vo2Max: null,
      power: null,
    });
  });
});

describe('computeRunningEstimates excluded runs', () => {
  it('leaves an excluded run out of VO2 max but keeps it for power', () => {
    const runs = [
      run(-2),
      run(-5),
      run(-8, { avgHeartRate: 150, excludeFromVo2: true }),
    ];
    const withAll = computeRunningEstimates(
      runs.map((r) => ({ ...r, excludeFromVo2: false })),
      TODAY,
      { bodyWeightKg: 70 }
    );
    const without = computeRunningEstimates(runs, TODAY, { bodyWeightKg: 70 });
    expect(withAll.vo2Max?.runs).toBe(3);
    expect(without.vo2Max?.runs).toBe(2);
    expect(without.power?.runs).toHaveLength(3);
  });

  it('gives no estimate once exclusions leave fewer than two runs', () => {
    const result = computeRunningEstimates(
      [run(-2), run(-5, { excludeFromVo2: true })],
      TODAY
    );
    expect(result.vo2Max).toBeNull();
  });
});
