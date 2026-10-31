import {
  selectTileTrends,
  summarizeHealthTrend,
  type HealthTrendTileInput,
} from '../../src/utils/healthTrendTiles';

const empty: HealthTrendTileInput = {
  steps: [],
  weight: [],
  sleep: [],
  hydration: [],
  calories: [],
  heartRate: [],
  vo2max: [],
};

describe('summarizeHealthTrend', () => {
  it('averages steps and ignores zero-filled days', () => {
    const summary = summarizeHealthTrend('steps', {
      ...empty,
      steps: [
        { day: '2026-10-01', steps: 4000 },
        { day: '2026-10-02', steps: 0 },
        { day: '2026-10-03', steps: 6000 },
      ],
    });
    expect(summary).toEqual({
      values: [4000, 6000],
      kind: 'average',
      headline: 5000,
      delta: null,
    });
  });

  it('uses the newest weight and the change across the window', () => {
    const summary = summarizeHealthTrend('weight', {
      ...empty,
      weight: [
        { day: '2026-10-01', weight: 80 },
        { day: '2026-10-05', weight: 79.2 },
      ],
    });
    expect(summary.kind).toBe('latest');
    expect(summary.headline).toBe(79.2);
    expect(summary.delta).toBeCloseTo(-0.8);
  });

  it('has no delta from a single reading', () => {
    const summary = summarizeHealthTrend('vo2max', {
      ...empty,
      vo2max: [{ day: '2026-10-01', vo2max: 45 }],
    });
    expect(summary.headline).toBe(45);
    expect(summary.delta).toBeNull();
  });

  it('converts sleep to hours and skips nights without time asleep', () => {
    const summary = summarizeHealthTrend('sleep', {
      ...empty,
      sleep: [
        {
          day: '2026-10-01',
          timeInBedSeconds: 30000,
          timeAsleepSeconds: 28800,
          segments: [],
          zone: null,
        },
        {
          day: '2026-10-02',
          timeInBedSeconds: 0,
          timeAsleepSeconds: null,
          segments: [],
          zone: null,
        },
      ],
    });
    expect(summary.values).toEqual([8]);
    expect(summary.headline).toBe(8);
  });

  it('reports no headline for an empty window', () => {
    expect(summarizeHealthTrend('calories', empty).headline).toBeNull();
    expect(summarizeHealthTrend('heartRate', empty).headline).toBeNull();
  });
});

describe('selectTileTrends', () => {
  it('keeps chosen tiles that are visible, in graph order', () => {
    expect(
      selectTileTrends(
        ['weight', 'steps', 'sleep'],
        ['sleep', 'weight', 'vo2max']
      )
    ).toEqual(['weight', 'sleep']);
  });
});
