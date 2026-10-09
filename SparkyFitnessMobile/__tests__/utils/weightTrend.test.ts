import {
  computeTrendWeights,
  computeWeightForecast,
} from '../../src/utils/weightTrend';

const daily = (start: number, step: number, count: number) =>
  Array.from({ length: count }, (_, i) => ({
    day: new Date(Date.UTC(2026, 5, 1 + i)).toISOString().slice(0, 10),
    weight: start + step * i,
  }));

describe('computeTrendWeights', () => {
  it('starts at the first reading and smooths a one-day spike', () => {
    const trend = computeTrendWeights([
      { day: '2026-06-01', weight: 80 },
      { day: '2026-06-02', weight: 82 },
    ]);
    expect(trend[0]).toBe(80);
    expect(trend[1]).toBeCloseTo(80.2, 5);
  });

  it('lets a reading after a gap count for more', () => {
    const next = computeTrendWeights([
      { day: '2026-06-01', weight: 80 },
      { day: '2026-06-02', weight: 82 },
    ])[1];
    const afterGap = computeTrendWeights([
      { day: '2026-06-01', weight: 80 },
      { day: '2026-06-08', weight: 82 },
    ])[1];
    expect(afterGap).toBeGreaterThan(next);
  });
});

describe('computeWeightForecast', () => {
  it('needs several weigh-ins over at least a week', () => {
    expect(computeWeightForecast([], 70).status).toBe('insufficient-data');
    expect(computeWeightForecast(daily(80, -0.1, 5), 70)).toMatchObject({
      status: 'insufficient-data',
      ratePerWeek: null,
    });
  });

  it('projects the goal date for a steady loss', () => {
    // -0.1/day: the trend lags the scale, but its slope settles at -0.1/day.
    const forecast = computeWeightForecast(daily(100, -0.1, 90), 80);
    expect(forecast.status).toBe('toward-goal');
    expect(forecast.ratePerWeek).toBeCloseTo(-0.7, 1);
    // The trend lags ~1 above the last reading (91.1), so 80 is a bit over 100 days out.
    expect(forecast.daysToGoal).toBeGreaterThan(100);
    expect(forecast.daysToGoal).toBeLessThan(130);
  });

  it('flags a trend moving away from the goal', () => {
    const forecast = computeWeightForecast(daily(80, 0.1, 90), 70);
    expect(forecast.status).toBe('away-from-goal');
    expect(forecast.daysToGoal).toBeNull();
  });

  it('reports steady when weight is flat', () => {
    expect(computeWeightForecast(daily(80, 0, 28), 70).status).toBe('steady');
  });

  it('reports no goal but still gives the rate', () => {
    const forecast = computeWeightForecast(daily(100, -0.1, 90), null);
    expect(forecast.status).toBe('no-goal');
    expect(forecast.ratePerWeek).toBeCloseTo(-0.7, 1);
  });

  it('does not forecast beyond two years', () => {
    expect(computeWeightForecast(daily(90, -0.01, 90), 40).status).toBe(
      'too-far'
    );
  });
});
