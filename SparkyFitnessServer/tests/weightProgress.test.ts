import { describe, expect, it } from 'vitest';
import {
  addDays,
  DEFAULT_WEIGHT_PROGRESS_SETTINGS,
  parseWeightProgressSettings,
  computeWeightMilestones,
  computeWeightProgress,
  energyBalanceWindow,
  ENERGY_BALANCE_WINDOW_DAYS,
  ENERGY_DENSITY_KCAL_PER_KG,
  estimateFatFromEnergyBalance,
  FAT_KCAL_PER_KG,
  milestonesToCelebrate,
  resolveWeightProgressStart,
  trendChangeBetween,
  waistToHeightBand,
  waistToHeightRatio,
  waistToHeightSeries,
  type WeightProgressStart,
} from '@workspace/shared';

const START = '2026-01-01';
/** One weigh-in a day, falling `perDay` kg from `from`. */
const falling = (from: number, perDay: number, days: number) =>
  Array.from({ length: days }, (_, i) => ({
    date: addDays(START, i),
    weight: from - perDay * i,
  }));

describe('resolveWeightProgressStart', () => {
  const samples = [
    { date: '2026-02-01', weight: 90 },
    { date: '2026-02-11', weight: 88 },
  ];

  it('defaults to the first weigh-in', () => {
    expect(resolveWeightProgressStart({ samples })).toEqual({
      date: '2026-02-01',
      weight: 90,
      source: 'first_measurement',
    });
  });

  it('uses an earlier onboarding weight, and onboarding with no weigh-ins', () => {
    expect(
      resolveWeightProgressStart({
        samples,
        onboardingWeight: 92,
        onboardingDate: '2026-01-15',
      })
    ).toEqual({ date: '2026-01-15', weight: 92, source: 'onboarding' });
    expect(
      resolveWeightProgressStart({
        samples,
        onboardingWeight: 92,
        onboardingDate: '2026-03-01',
      })?.source
    ).toBe('first_measurement');
    expect(
      resolveWeightProgressStart({
        samples: [],
        onboardingWeight: 92,
        onboardingDate: '2026-01-15',
      })?.weight
    ).toBe(92);
    expect(resolveWeightProgressStart({ samples: [] })).toBeNull();
  });

  it('prefers a custom start, reading the trend when no weight is given', () => {
    expect(
      resolveWeightProgressStart({
        samples,
        custom: { date: '2026-02-05', weight: 95 },
      })
    ).toEqual({ date: '2026-02-05', weight: 95, source: 'custom' });
    const fromTrend = resolveWeightProgressStart({
      samples,
      custom: { date: '2026-02-05' },
    });
    expect(fromTrend?.source).toBe('custom');
    // Interpolated 90 -> 89.2 over five days, trailing mean of 90..89.2.
    expect(fromTrend?.weight).toBeCloseTo(89.6);
  });

  it('ignores a malformed custom date', () => {
    expect(
      resolveWeightProgressStart({ samples, custom: { date: 'yesterday' } })
        ?.source
    ).toBe('first_measurement');
  });
});

describe('computeWeightProgress', () => {
  const samples = falling(100, 0.2, 61); // 100 -> 88 kg over 60 days
  const start: WeightProgressStart = {
    date: START,
    weight: 100,
    source: 'first_measurement',
  };

  it('reads change from the trend, not the last scale reading', () => {
    const progress = computeWeightProgress({ samples, start, target: 80 })!;
    // Trailing 7-day mean lags the line by 3 days: 88 + 0.6.
    expect(progress.currentTrend).toBeCloseTo(88.6);
    expect(progress.totalChange).toBeCloseTo(-11.4);
    expect(progress.percentChange).toBeCloseTo(-11.4);
    expect(progress.goal).toMatchObject({ direction: 'lose', reached: false });
    expect(progress.goal!.percentToGoal).toBeCloseTo(57);
    expect(progress.goal!.remaining).toBeCloseTo(8.6);
  });

  it('caps percent to goal and marks the goal reached', () => {
    const progress = computeWeightProgress({ samples, start, target: 95 })!;
    expect(progress.goal).toMatchObject({
      percentToGoal: 100,
      remaining: 0,
      reached: true,
    });
  });

  it('handles a gain goal, and a goal moving the wrong way', () => {
    const gain = computeWeightProgress({ samples, start, target: 110 })!;
    expect(gain.goal!.direction).toBe('gain');
    expect(gain.goal!.percentToGoal).toBe(0);
    expect(gain.goal!.remaining).toBe(10);
  });

  it('has no goal block without a goal or with the goal at the start', () => {
    expect(computeWeightProgress({ samples, start })!.goal).toBeNull();
    expect(
      computeWeightProgress({ samples, start, target: 100 })!.goal
    ).toBeNull();
    expect(computeWeightProgress({ samples: [], start })).toBeNull();
    expect(computeWeightProgress({ samples, start: null })).toBeNull();
  });
});

describe('computeWeightMilestones', () => {
  const samples = falling(100, 0.2, 61);
  const start: WeightProgressStart = {
    date: START,
    weight: 100,
    source: 'first_measurement',
  };

  it('lists amount, percent, halfway and goal milestones in order', () => {
    const summary = computeWeightMilestones({
      samples,
      start,
      target: 80,
      unit: 'kg',
    })!;
    expect(summary.direction).toBe('lose');
    expect(summary.achieved.map((m) => m.id)).toEqual([
      'amount:5:kg',
      'percent:5',
      'amount:10:kg',
      'percent:10',
      'halfway',
    ]);
    expect(summary.next?.id).toBe('amount:15:kg');
    expect(summary.toNext).toBeCloseTo(3.6);
    // Goal (20 kg) is its own milestone; no 20 kg amount or 20% percent.
    expect(summary.achieved.every((m) => m.achievedOn !== null)).toBe(true);
  });

  it('dates a milestone by the first trend day that crossed it', () => {
    const summary = computeWeightMilestones({
      samples,
      start,
      target: 80,
      unit: 'kg',
    })!;
    // Trend = 100 - 0.2 * (i - 3) once the window fills: 5 kg on day 28.
    expect(summary.achieved[0]!.achievedOn).toBe(addDays(START, 28));
  });

  it('counts amount steps in pounds for a pounds user', () => {
    const summary = computeWeightMilestones({
      samples,
      start,
      target: 80,
      unit: 'lbs',
    })!;
    expect(summary.achieved.map((m) => m.id)).toContain('amount:20:lbs');
    expect(summary.achieved.map((m) => m.id)).not.toContain('amount:5:kg');
  });

  it('follows the trend direction without a goal', () => {
    const gaining = falling(70, -0.1, 61);
    const summary = computeWeightMilestones({
      samples: gaining,
      start: { date: START, weight: 70, source: 'first_measurement' },
      unit: 'kg',
    })!;
    expect(summary.direction).toBe('gain');
    // 5% of 70 kg is 3.5 kg, so it comes before the 5 kg step.
    expect(summary.achieved.map((m) => m.id)).toEqual([
      'percent:5',
      'amount:5:kg',
    ]);
    expect(summary.next?.id).toBe('percent:10');
    expect(
      [...summary.achieved, summary.next].some((m) => m?.kind === 'goal')
    ).toBe(false);
  });

  it('marks the goal reached', () => {
    const summary = computeWeightMilestones({
      samples,
      start,
      target: 92,
      unit: 'kg',
    })!;
    expect(summary.achieved.map((m) => m.id)).toEqual([
      'halfway',
      'amount:5:kg',
      'percent:5',
      'goal',
    ]);
    expect(summary.next).toBeNull();
    expect(summary.toNext).toBeNull();
  });
});

describe('milestonesToCelebrate', () => {
  const summary = computeWeightMilestones({
    samples: falling(100, 0.2, 61),
    start: { date: START, weight: 100, source: 'first_measurement' },
    target: 80,
    unit: 'kg',
  })!;

  it('celebrates nothing on first view or for a new start', () => {
    expect(milestonesToCelebrate(summary.achieved, START, null)).toEqual([]);
    expect(
      milestonesToCelebrate(summary.achieved, START, {
        startDate: '2025-06-01',
        ids: [],
      })
    ).toEqual([]);
  });

  it('celebrates only milestones not seen before', () => {
    const fresh = milestonesToCelebrate(summary.achieved, START, {
      startDate: START,
      ids: ['amount:5:kg', 'percent:5', 'amount:10:kg'],
    });
    expect(fresh.map((m) => m.id)).toEqual(['percent:10', 'halfway']);
  });
});

describe('estimateFatFromEnergyBalance', () => {
  const samples = falling(100, 0.1, 40);

  it('counts only days with a real food log', () => {
    const intake = [
      ...Array.from({ length: 10 }, (_, i) => ({
        date: addDays(START, i),
        calories: 1800,
      })),
      { date: addDays(START, 10), calories: 150 }, // unknown, not a fast
      { date: addDays(START, 11), calories: 0 },
    ];
    const estimate = estimateFatFromEnergyBalance({
      intake,
      expenditureKcal: 2300,
      from: START,
      to: addDays(START, 19),
      samples,
    })!;
    expect(estimate.loggedDays).toBe(10);
    expect(estimate.windowDays).toBe(20);
    expect(estimate.deficitKcal).toBe(5000);
    expect(estimate.estimatedFatKg).toBeCloseTo(5000 / FAT_KCAL_PER_KG);
    expect(estimate.predictedChangeKg).toBeCloseTo(
      -5000 / ENERGY_DENSITY_KCAL_PER_KG
    );
    expect(estimate.actualChangeKg).toBeCloseTo(-1.6);
    expect(estimate.enough).toBe(true);
  });

  it('adds several rows for one day, and ignores days outside the window', () => {
    const estimate = estimateFatFromEnergyBalance({
      intake: [
        { date: START, calories: 150 },
        { date: START, calories: 150 },
        { date: addDays(START, -1), calories: 1000 },
      ],
      expenditureKcal: 2000,
      from: START,
      to: addDays(START, 6),
      samples,
    })!;
    expect(estimate.loggedDays).toBe(1);
    expect(estimate.deficitKcal).toBe(1700);
    expect(estimate.enough).toBe(false);
  });

  it('reports a surplus as negative fat lost', () => {
    const estimate = estimateFatFromEnergyBalance({
      intake: [{ date: START, calories: 3000 }],
      expenditureKcal: 2500,
      from: START,
      to: START,
      samples: [],
    })!;
    expect(estimate.estimatedFatKg).toBeLessThan(0);
    expect(estimate.predictedChangeKg).toBeGreaterThan(0);
    expect(estimate.actualChangeKg).toBeNull();
  });

  it('needs an expenditure figure and an ordered window', () => {
    const base = { intake: [], from: START, to: START, samples: [] };
    expect(
      estimateFatFromEnergyBalance({ ...base, expenditureKcal: null })
    ).toBeNull();
    expect(
      estimateFatFromEnergyBalance({
        ...base,
        expenditureKcal: 2000,
        from: addDays(START, 1),
      })
    ).toBeNull();
  });
});

describe('energyBalanceWindow / trendChangeBetween', () => {
  it('ends yesterday and never starts before the progress start', () => {
    expect(energyBalanceWindow('2026-06-30', null)).toEqual({
      from: addDays('2026-06-29', -(ENERGY_BALANCE_WINDOW_DAYS - 1)),
      to: '2026-06-29',
    });
    expect(energyBalanceWindow('2026-06-30', '2026-06-20')).toEqual({
      from: '2026-06-20',
      to: '2026-06-29',
    });
    expect(energyBalanceWindow('2026-06-30', '2026-06-30')).toEqual({
      from: '2026-06-29',
      to: '2026-06-29',
    });
  });

  it('needs two trend days inside the window', () => {
    const samples = falling(80, 0.1, 10);
    expect(trendChangeBetween(samples, START, START)).toBeNull();
    expect(trendChangeBetween(samples, '2025-01-01', '2025-02-01')).toBeNull();
    expect(trendChangeBetween(samples, START, addDays(START, 9))).toBeLessThan(
      0
    );
  });
});

describe('waist-to-height ratio', () => {
  it('is unit-free and refuses missing or impossible values', () => {
    expect(waistToHeightRatio(85, 170)).toBe(0.5);
    expect(waistToHeightRatio(33.5, 67)).toBe(0.5);
    expect(waistToHeightRatio(null, 170)).toBeNull();
    expect(waistToHeightRatio(80, 0)).toBeNull();
  });

  it('bands at 0.5 and 0.6', () => {
    expect(waistToHeightBand(0.49)).toBe('lower');
    expect(waistToHeightBand(0.5)).toBe('increased');
    expect(waistToHeightBand(0.59)).toBe('increased');
    expect(waistToHeightBand(0.6)).toBe('high');
  });

  it('pairs each waist with the latest height on or before it', () => {
    const series = waistToHeightSeries([
      { date: '2026-03-01', waist: 90 },
      { date: '2026-01-01', waist: '100', height: '200' },
      { date: '2026-02-01', height: 180 },
      { date: '2026-04-01', waist: null },
      { date: 'bad', waist: 10, height: 10 },
    ]);
    expect(series.map((p) => [p.date, p.ratio, p.band])).toEqual([
      ['2026-01-01', 0.5, 'increased'],
      ['2026-03-01', 0.5, 'increased'],
    ]);
  });

  it('borrows a later height when none came before, and needs one', () => {
    expect(
      waistToHeightSeries([
        { date: '2026-01-01', waist: 80 },
        { date: '2026-02-01', height: 200 },
      ])[0]
    ).toMatchObject({ ratio: 0.4, band: 'lower' });
    expect(waistToHeightSeries([{ date: '2026-01-01', waist: 80 }])).toEqual(
      []
    );
  });
});

describe('parseWeightProgressSettings', () => {
  it('reads stored settings and drops what it cannot use', () => {
    expect(
      parseWeightProgressSettings({
        customStart: { date: '2026-01-01', weight: 90 },
        milestonesHidden: true,
        seen: { startDate: '2026-01-01', ids: ['goal'] },
      })
    ).toEqual({
      customStart: { date: '2026-01-01', weight: 90 },
      milestonesHidden: true,
      seen: { startDate: '2026-01-01', ids: ['goal'] },
    });
    expect(
      parseWeightProgressSettings({
        customStart: { date: 'soon' },
        milestonesHidden: 'yes',
        seen: 3,
      })
    ).toEqual(DEFAULT_WEIGHT_PROGRESS_SETTINGS);
    expect(parseWeightProgressSettings('nonsense')).toEqual(
      DEFAULT_WEIGHT_PROGRESS_SETTINGS
    );
  });
});
