import type { GpsTrackPoint } from '@workspace/shared';
import {
  bestEffortIdsForUnit,
  isRunSession,
  runBestEfforts,
} from '../../src/utils/bestEfforts';

const point = (second: number, meters: number): GpsTrackPoint => ({
  t: new Date(Date.UTC(2026, 0, 1, 8, 0, second)).toISOString(),
  lat: 50 + (meters / 10) * 0.0000899,
  lon: 4,
});

describe('bestEffortIdsForUnit', () => {
  it('uses the kilometre or the mile for the short distance', () => {
    expect(bestEffortIdsForUnit('km')[0]).toBe('1k');
    expect(bestEffortIdsForUnit('miles')[0]).toBe('1mi');
    expect(bestEffortIdsForUnit('km').slice(1)).toEqual([
      '5k',
      '10k',
      'half_marathon',
    ]);
  });
});

describe('runBestEfforts', () => {
  it('reads the GPS track when there is one', () => {
    const track = Array.from({ length: 451 }, (_, i) => point(i, i * 4));
    const efforts = runBestEfforts(track);
    expect(efforts.map((e) => e.id)).toEqual(['1k', '1mi']);
    expect(efforts[0]?.seconds).toBeCloseTo(250, 0);
  });

  it('gives a run with no route none, since an indoor distance series is a pedometer estimate', () => {
    expect(runBestEfforts([])).toEqual([]);
  });

  it('is empty for a run that is too short', () => {
    expect(runBestEfforts([point(0, 0), point(60, 200)])).toEqual([]);
  });
});

describe('isRunSession', () => {
  it('accepts runs and rejects rides', () => {
    expect(
      isRunSession({
        exerciseName: 'Morning Run',
        category: 'running',
        notes: null,
      })
    ).toBe(true);
    expect(
      isRunSession({
        exerciseName: 'Bike Ride',
        category: 'cycling',
        notes: null,
      })
    ).toBe(false);
  });
});
