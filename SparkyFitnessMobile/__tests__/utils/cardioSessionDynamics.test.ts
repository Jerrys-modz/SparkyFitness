import type {
  ExerciseActivityQueryItem,
  GpsTrackPoint,
} from '@workspace/shared';
import {
  resolveRunningDynamics,
  runningDynamicsCharts,
  verticalOscillationDisplay,
} from '../../src/utils/cardioSessionStats';

const session = (overrides: Partial<ExerciseActivityQueryItem> = {}) =>
  ({
    id: 'run-1',
    exerciseName: 'Running',
    ...overrides,
  }) as ExerciseActivityQueryItem;

const track = Array.from(
  { length: 5 },
  (_, i) =>
    ({
      t: new Date(Date.UTC(2026, 9, 18, 7, 0, i * 30)).toISOString(),
      lat: 0,
      lon: 0,
      gct: 240 + i * 5,
      vo: 80,
      stride: 100,
      power: 200,
    }) as GpsTrackPoint
);

describe('resolveRunningDynamics', () => {
  it('prefers what the session row says over the track', () => {
    const resolved = resolveRunningDynamics(
      session({
        groundContactTimeMs: 250,
        verticalOscillationMm: 90,
        avgPowerWatts: 240,
      }),
      {
        groundContactTimeMs: 999,
        verticalOscillationMm: 999,
        strideLengthCm: 100,
        powerWatts: 999,
        verticalRatioPercent: 9,
      }
    );
    expect(resolved).toEqual({
      groundContactTimeMs: 250,
      verticalOscillationMm: 90,
      // 90 mm over the track's 100 cm step, since the row has no stride.
      verticalRatioPercent: 9,
      powerWatts: 240,
    });
  });

  it('falls back to the track for what the row lacks', () => {
    const resolved = resolveRunningDynamics(session(), {
      groundContactTimeMs: 250,
      verticalOscillationMm: 80,
      strideLengthCm: 100,
      powerWatts: 200,
      verticalRatioPercent: 8,
    });
    expect(resolved.groundContactTimeMs).toBe(250);
    expect(resolved.verticalRatioPercent).toBe(8);
  });

  it('is all null with neither, and treats zero as not measured', () => {
    const none = {
      groundContactTimeMs: null,
      verticalOscillationMm: null,
      verticalRatioPercent: null,
      powerWatts: null,
    };
    expect(resolveRunningDynamics(session(), null)).toEqual(none);
    expect(
      resolveRunningDynamics(
        session({ groundContactTimeMs: 0, avgPowerWatts: 0 }),
        null
      )
    ).toEqual(none);
  });

  it('does not make up a vertical ratio without a step length', () => {
    expect(
      resolveRunningDynamics(session({ verticalOscillationMm: 80 }), null)
        .verticalRatioPercent
    ).toBeNull();
  });
});

describe('verticalOscillationDisplay', () => {
  it('is centimetres with km and inches with miles', () => {
    expect(verticalOscillationDisplay(81, 'km')).toBeCloseTo(8.1, 6);
    expect(verticalOscillationDisplay(25.4, 'miles')).toBeCloseTo(1, 6);
  });
});

describe('runningDynamicsCharts', () => {
  it('builds a series per metric in the display unit', () => {
    const metric = runningDynamicsCharts(track, 'km');
    expect(metric.groundContact.map((r) => r.value)).toEqual([
      240, 245, 250, 255, 260,
    ]);
    expect(metric.verticalOscillation[0].value).toBeCloseTo(8, 6);
    expect(metric.verticalRatio[0].value).toBe(8);
    expect(metric.power).toHaveLength(5);
    const imperial = runningDynamicsCharts(track, 'miles');
    expect(imperial.verticalOscillation[0].value).toBeCloseTo(3.15, 2);
  });

  it('is empty for a track without dynamics', () => {
    const bare = track.map(({ t, lat, lon }) => ({ t, lat, lon }));
    expect(runningDynamicsCharts(bare, 'km')).toEqual({
      groundContact: [],
      verticalOscillation: [],
      verticalRatio: [],
      power: [],
    });
  });
});
