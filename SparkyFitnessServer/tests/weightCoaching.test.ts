import { describe, expect, it } from 'vitest';
import {
  COACHING_MIN_LOGGED_DAYS,
  COACHING_MIN_WEIGH_INS,
  ENERGY_DENSITY_KCAL_PER_KG,
  addDays,
  buildExpenditureHistory,
  buildWeightCoachingCheckIn,
  coachingDataNotes,
  isCoachingCheckInDay,
  splitMacrosForCalories,
  targetWeeklyChangeKg,
  type CoachingGoalDirection,
  type CoachingIntakeDay,
  type CoachingTargets,
  type CoachingWeighIn,
  type WeightCoachingInput,
} from '@workspace/shared';

const START = '2026-09-01';
const DAYS = 90;
const TODAY = addDays(START, DAYS - 1);
const CURRENT: CoachingTargets = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fat: 55,
};

/** Daily weigh-ins drifting `kgPerWeek`, with a small repeatable wobble. */
function weighIns(
  kgPerWeek: number,
  keep: (dayIndex: number) => boolean = () => true,
  wobble = 0.25
): CoachingWeighIn[] {
  const out: CoachingWeighIn[] = [];
  for (let d = 0; d < DAYS; d++) {
    if (!keep(d)) continue;
    out.push({
      date: addDays(START, d),
      weightKg: 80 + (kgPerWeek / 7) * d + wobble * Math.sin(d * 2.1),
    });
  }
  return out;
}

function intake(
  kcal: number,
  keep: (dayIndex: number) => boolean = () => true
): CoachingIntakeDay[] {
  const out: CoachingIntakeDay[] = [];
  for (let d = 0; d < DAYS; d++) {
    if (keep(d)) out.push({ date: addDays(START, d), calories: kcal });
  }
  return out;
}

function checkIn(
  overrides: Partial<WeightCoachingInput> & {
    direction?: CoachingGoalDirection;
    rate?: number;
  } = {}
) {
  const { direction = 'lose', rate = 0.5, ...rest } = overrides;
  return buildWeightCoachingCheckIn({
    today: TODAY,
    weighIns: weighIns(-0.5),
    intake: intake(2000),
    current: CURRENT,
    goal: { direction, rateKgPerWeek: rate },
    safetyFloorKcal: 1200,
    ...rest,
  });
}

// Losing 0.5 kg/week on 2000 kcal means spending 2000 + 0.5 * density / 7.
const TRUE_EXPENDITURE = 2000 + (0.5 * ENERGY_DENSITY_KCAL_PER_KG) / 7;

describe('data requirements', () => {
  it('says nothing without data', () => {
    const result = checkIn({ weighIns: [], intake: [] });
    expect(result.reason).toBe('insufficient-data');
    expect(result.suggested).toBeNull();
    expect(result.actionable).toBe(false);
    expect(result.dataQuality.ready).toBe(false);
    expect(result.expenditure.kcal).toBeNull();
    expect(result.dataQuality.missingLoggedDays).toBe(COACHING_MIN_LOGGED_DAYS);
    expect(result.dataQuality.missingWeighIns).toBe(COACHING_MIN_WEIGH_INS);
  });

  it('counts how many more logged days are needed', () => {
    // Today is still being logged, so it is not counted: 7 days of intake
    // ending today make 6 usable ones.
    const result = checkIn({ intake: intake(2000, (d) => d >= DAYS - 7) });
    expect(result.reason).toBe('insufficient-data');
    expect(result.dataQuality.loggedDays).toBe(6);
    expect(result.dataQuality.missingLoggedDays).toBe(
      COACHING_MIN_LOGGED_DAYS - 6
    );
  });

  it('needs weigh-ins that span two weeks', () => {
    const result = checkIn({
      weighIns: weighIns(-0.5, (d) => d >= DAYS - 8),
    });
    expect(result.reason).toBe('insufficient-data');
    expect(result.dataQuality.weighInSpanDays).toBe(7);
    expect(result.dataQuality.missingSpanDays).toBe(7);
  });

  it('does not judge when too many days are unlogged', () => {
    // 12 logged days spread over the whole window: enough days, too many gaps.
    const result = checkIn({
      intake: intake(
        2000,
        (d) => d >= DAYS - 28 && (d - (DAYS - 28)) % 2 === 0 && d % 5 !== 0
      ).slice(0, 12),
    });
    expect(result.dataQuality.loggedDays).toBe(12);
    expect(result.dataQuality.adherence).toBeLessThan(0.6);
    expect(result.reason).toBe('low-adherence');
    expect(result.suggested).toBeNull();
  });

  it('refuses an implausible estimate', () => {
    const result = checkIn({ intake: intake(400) });
    expect(result.reason).toBe('implausible-estimate');
    expect(result.suggested).toBeNull();
  });
});

describe('expenditure estimate', () => {
  it('recovers expenditure from intake and the weight trend', () => {
    const result = checkIn();
    expect(result.dataQuality.ready).toBe(true);
    expect(result.expenditure.rawKcal).toBeGreaterThan(TRUE_EXPENDITURE - 100);
    expect(result.expenditure.rawKcal).toBeLessThan(TRUE_EXPENDITURE + 100);
    expect(result.trend.weeklyRateKg).toBeGreaterThan(-0.6);
    expect(result.trend.weeklyRateKg).toBeLessThan(-0.4);
    expect(result.expenditure.avgIntakeKcal).toBe(2000);
    expect(result.expenditure.marginKcal).toBeGreaterThan(0);
  });

  it('is not thrown by a wildly wrong weigh-in', () => {
    const clean = checkIn();
    const bad = weighIns(-0.5);
    bad[bad.length - 4] = { ...bad[bad.length - 4]!, weightKg: 91 };
    bad[bad.length - 15] = { ...bad[bad.length - 15]!, weightKg: 62 };
    const result = checkIn({ weighIns: bad });
    expect(result.dataQuality.outlierWeighIns).toBe(2);
    expect(
      result.trend.series.filter((p) => p.outlier).map((p) => p.weightKg)
    ).toEqual([62, 91]);
    expect(
      Math.abs(result.expenditure.rawKcal! - clean.expenditure.rawKcal!)
    ).toBeLessThan(40);
    // The trend line ignores the outlier too.
    const flagged = result.trend.series.find((p) => p.weightKg === 91)!;
    expect(Math.abs(flagged.trendKg - 91)).toBeGreaterThan(5);
  });

  it('copes with missed weigh-ins', () => {
    const result = checkIn({ weighIns: weighIns(-0.5, (d) => d % 3 === 0) });
    expect(result.dataQuality.ready).toBe(true);
    expect(
      Math.abs(result.expenditure.rawKcal! - TRUE_EXPENDITURE)
    ).toBeLessThan(150);
  });

  it('is steady through a one-day water swing', () => {
    const swing = weighIns(-0.5).map((w, i, all) =>
      i === all.length - 2 ? { ...w, weightKg: w.weightKg + 1.1 } : w
    );
    const result = checkIn({ weighIns: swing });
    expect(
      Math.abs(result.expenditure.rawKcal! - TRUE_EXPENDITURE)
    ).toBeLessThan(150);
  });

  it('averages only days that were actually logged', () => {
    const days = intake(2000);
    // A half-logged day and a day flagged incomplete must not drag the average down.
    days[days.length - 2] = { ...days[days.length - 2]!, calories: 500 };
    days[days.length - 3] = {
      ...days[days.length - 3]!,
      calories: 1200,
      incomplete: true,
    };
    const result = checkIn({ intake: days });
    expect(result.dataQuality.excludedDays).toBe(2);
    expect(result.expenditure.avgIntakeKcal).toBe(2000);
    // Days with no entry at all are simply absent from the average.
    const sparse = checkIn({ intake: intake(2000, (d) => d % 4 !== 0) });
    expect(sparse.expenditure.avgIntakeKcal).toBe(2000);
  });

  it('ignores non-finite, invalid and duplicate input', () => {
    const noisy = [
      ...weighIns(-0.5),
      { date: 'not-a-day', weightKg: 80 },
      { date: addDays(START, 5), weightKg: Number.NaN },
      { date: addDays(START, 6), weightKg: -3 },
    ];
    const days = [
      ...intake(2000),
      { date: addDays(START, 7), calories: Number.NaN },
      { date: '2026-13-45', calories: 100 },
    ];
    const result = checkIn({ weighIns: noisy, intake: days });
    expect(result.dataQuality.ready).toBe(true);
    expect(
      Math.abs(result.expenditure.rawKcal! - TRUE_EXPENDITURE)
    ).toBeLessThan(100);
  });

  it('does not depend on input order', () => {
    const forward = checkIn();
    const reversed = checkIn({
      weighIns: [...weighIns(-0.5)].reverse(),
      intake: [...intake(2000)].reverse(),
    });
    expect(reversed.expenditure.rawKcal).toBeCloseTo(
      forward.expenditure.rawKcal!,
      6
    );
    expect(reversed.trend.series).toEqual(forward.trend.series);
  });

  it('works across a month and year boundary', () => {
    const base = '2026-11-20';
    const w: CoachingWeighIn[] = [];
    const i: CoachingIntakeDay[] = [];
    for (let d = 0; d < 30; d++) {
      w.push({ date: addDays(base, d), weightKg: 75 + (0 / 7) * d });
      i.push({ date: addDays(base, d), calories: 2200 });
    }
    const result = buildWeightCoachingCheckIn({
      today: addDays(base, 29),
      weighIns: w,
      intake: i,
      current: CURRENT,
      goal: { direction: 'maintain', rateKgPerWeek: 0 },
      safetyFloorKcal: 1200,
    });
    expect(result.asOf).toBe('2026-12-19');
    expect(result.expenditure.rawKcal).toBeCloseTo(2200, 5);
    expect(result.reason).toBe('on-track');
  });
});

describe('expenditure history', () => {
  it('is oldest first, with a smoothed copy', () => {
    const history = buildExpenditureHistory(
      weighIns(-0.5),
      intake(2000),
      TODAY
    );
    expect(history.length).toBeGreaterThan(3);
    const days = history.map((h) => h.date);
    expect([...days].sort()).toEqual(days);
    expect(history[0]!.smoothedKcal).toBe(history[0]!.kcal);
    for (const point of history) {
      expect(Math.abs(point.smoothedKcal - TRUE_EXPENDITURE)).toBeLessThan(200);
    }
  });

  it('smooths a jump rather than following it', () => {
    // Intake rises for the last two weeks while weight stays on its line.
    const jumpy = intake(2000).map((d, i) =>
      i >= DAYS - 14 ? { ...d, calories: 3000 } : d
    );
    const history = buildExpenditureHistory(weighIns(-0.5), jumpy, TODAY);
    const last = history[history.length - 1]!;
    expect(last.smoothedKcal).toBeLessThan(last.kcal);
  });
});

describe('recommendation', () => {
  it('leaves the target alone when on track', () => {
    const result = checkIn({ direction: 'lose', rate: 0.5 });
    expect(result.reason).toBe('on-track');
    expect(result.suggested).toBeNull();
    expect(result.changeKcal).toBe(0);
    expect(result.actionable).toBe(false);
  });

  it('cuts calories when behind a loss goal, capped at 10 percent a week', () => {
    // Weight is flat on 2000 kcal; the goal is 0.5 kg/week down.
    const result = checkIn({ weighIns: weighIns(0), intake: intake(2000) });
    expect(result.reason).toBe('behind');
    expect(result.actionable).toBe(true);
    expect(result.limits).toContain('weekly-cap');
    expect(result.suggested!.calories).toBe(1800);
    expect(result.changeKcal).toBe(-200);
  });

  it('moves the full distance when the change is small enough', () => {
    // Losing 0.4 against 0.5: only a small correction is wanted.
    const result = checkIn({
      weighIns: weighIns(-0.3),
      intake: intake(2000),
      rate: 0.5,
    });
    expect(result.reason).toBe('behind');
    expect(result.limits).toEqual([]);
    const wanted =
      result.expenditure.kcal! - (0.5 * ENERGY_DENSITY_KCAL_PER_KG) / 7;
    expect(Math.abs(result.suggested!.calories - wanted)).toBeLessThanOrEqual(
      5
    );
    expect(result.suggested!.calories % 10).toBe(0);
  });

  it('raises calories when losing faster than asked', () => {
    const result = checkIn({
      weighIns: weighIns(-1),
      intake: intake(2000),
      rate: 0.25,
    });
    expect(result.reason).toBe('ahead');
    expect(result.suggested!.calories).toBeGreaterThan(2000);
    expect(result.suggested!.calories).toBeLessThanOrEqual(2200);
  });

  it('raises calories when a gain goal is behind', () => {
    const result = checkIn({
      direction: 'gain',
      rate: 0.25,
      weighIns: weighIns(0),
      intake: intake(2000),
    });
    expect(result.reason).toBe('behind');
    expect(result.goal.targetWeeklyChangeKg).toBe(0.25);
    expect(result.suggested!.calories).toBeGreaterThan(2000);
  });

  it('holds a maintain goal when weight is steady and corrects drift', () => {
    const steady = checkIn({
      direction: 'maintain',
      rate: 0,
      weighIns: weighIns(0),
    });
    expect(steady.reason).toBe('on-track');
    const drifting = checkIn({
      direction: 'maintain',
      rate: 0,
      weighIns: weighIns(0.6),
    });
    expect(drifting.reason).toBe('drifting');
    expect(drifting.suggested!.calories).toBeLessThan(2000);
  });

  it('never goes below the safety floor', () => {
    const result = checkIn({
      current: { calories: 1300, protein: 100, carbs: 120, fat: 40 },
      weighIns: weighIns(0),
      intake: intake(1400),
      rate: 1,
      safetyFloorKcal: 1250,
    });
    expect(result.reason).toBe('behind');
    expect(result.suggested!.calories).toBe(1250);
    expect(result.limits).toContain('safety-floor');
  });

  it('may switch the floor off', () => {
    const result = checkIn({
      weighIns: weighIns(0),
      intake: intake(2000),
      safetyFloorKcal: null,
    });
    expect(result.limits).toEqual(['weekly-cap']);
  });

  it('leaves the target when the wanted change is under 25 kcal', () => {
    // Behind the goal rate, but the target already sits within a few kcal of
    // what the estimate calls for.
    const result = checkIn({
      weighIns: weighIns(-0.35),
      intake: intake(2000),
      current: { calories: 1870, protein: 150, carbs: 200, fat: 55 },
      rate: 0.5,
    });
    // The weight is off the goal rate while the target already fits, so the
    // cause is what is being eaten, not the target.
    expect(result.reason).toBe('off-target-intake');
    expect(result.suggested).toBeNull();
    expect(result.actionable).toBe(false);
  });

  it('keeps the macro split in the suggestion', () => {
    const result = checkIn({ weighIns: weighIns(0), intake: intake(2000) });
    const s = result.suggested!;
    const kcalOf = (t: CoachingTargets) =>
      t.protein * 4 + t.carbs * 4 + t.fat * 9;
    expect(Math.abs(kcalOf(s) - s.calories)).toBeLessThan(15);
    expect(s.carbs / s.fat).toBeCloseTo(CURRENT.carbs / CURRENT.fat, 0);
  });

  it('reports the goal in kg per week with its sign', () => {
    expect(targetWeeklyChangeKg('lose', 0.5)).toBe(-0.5);
    expect(targetWeeklyChangeKg('gain', 0.25)).toBe(0.25);
    expect(targetWeeklyChangeKg('maintain', 0.5)).toBeCloseTo(0);
    expect(targetWeeklyChangeKg('lose', 7)).toBe(-1);
    expect(targetWeeklyChangeKg('lose', -1)).toBeCloseTo(0);
    expect(targetWeeklyChangeKg('lose', Number.NaN)).toBeCloseTo(0);
  });
});

describe('macro split', () => {
  it('scales protein, carbs and fat together', () => {
    const { targets, proteinFloorApplied } = splitMacrosForCalories(
      { calories: 2000, protein: 100, carbs: 250, fat: 55 },
      1800,
      50
    );
    expect(proteinFloorApplied).toBe(false);
    expect(targets.calories).toBe(1800);
    // The macros are rescaled so they add up to the new calories.
    expect(targets.protein).toBe(95);
    expect(targets.carbs).toBe(237);
    expect(targets.fat).toBe(52);
  });

  it('holds protein at the per-kg floor when calories fall', () => {
    const { targets, proteinFloorApplied } = splitMacrosForCalories(
      CURRENT,
      1500,
      80
    );
    expect(proteinFloorApplied).toBe(true);
    expect(targets.protein).toBe(128);
    // Carbs and fat share the remainder in their existing ratio.
    expect(
      targets.carbs * 4 + targets.fat * 9 + targets.protein * 4
    ).toBeGreaterThan(1490);
    expect(
      targets.carbs * 4 + targets.fat * 9 + targets.protein * 4
    ).toBeLessThan(1510);
    expect(targets.carbs / targets.fat).toBeCloseTo(200 / 55, 0);
  });

  it('never raises protein above what the person already has', () => {
    const { targets } = splitMacrosForCalories(
      { calories: 2000, protein: 90, carbs: 250, fat: 60 },
      1400,
      100
    );
    expect(targets.protein).toBeGreaterThanOrEqual(63);
    expect(targets.protein).toBeLessThanOrEqual(90);
  });

  it('falls back to a default split when no macros are set', () => {
    const { targets } = splitMacrosForCalories(
      { calories: 2000, protein: 0, carbs: 0, fat: 0 },
      2000,
      null
    );
    expect(targets.protein).toBe(150);
    expect(targets.carbs).toBe(200);
    expect(targets.fat).toBe(67);
  });

  it('leaves out calories the macros do not cover', () => {
    const { targets } = splitMacrosForCalories(
      { calories: 2000, protein: 100, carbs: 200, fat: 50 },
      2000,
      null,
      60
    );
    expect(
      targets.protein * 4 + targets.carbs * 4 + targets.fat * 9
    ).toBeLessThan(1950);
  });
});

describe('check-in day', () => {
  it('matches the weekday (0 = Sunday) of a calendar day', () => {
    expect(isCoachingCheckInDay('2026-10-18', 0)).toBe(true);
    expect(isCoachingCheckInDay('2026-10-17', 0)).toBe(false);
    expect(isCoachingCheckInDay('2026-10-17', 6)).toBe(true);
    expect(isCoachingCheckInDay('garbage', 0)).toBe(false);
  });
});

describe('data notes', () => {
  const quality = checkIn().dataQuality;

  it('lists what is missing before anything else', () => {
    const notes = coachingDataNotes(
      {
        ...quality,
        missingLoggedDays: 3,
        missingWeighIns: 2,
        missingSpanDays: 5,
      },
      'insufficient-data'
    );
    expect(notes.slice(0, 3)).toEqual([
      { kind: 'logDays', count: 3 },
      { kind: 'weighIns', count: 2 },
      { kind: 'weighSpan', count: 5 },
    ]);
  });

  it('reports adherence only when it is the reason', () => {
    expect(
      coachingDataNotes({ ...quality, adherence: 0.43 }, 'low-adherence')
    ).toContainEqual({ kind: 'lowAdherence', percent: 43 });
    expect(
      coachingDataNotes({ ...quality, adherence: 0.43 }, 'behind').some(
        (n) => n.kind === 'lowAdherence'
      )
    ).toBe(false);
  });

  it('mentions excluded days and ignored weigh-ins', () => {
    expect(
      coachingDataNotes(
        { ...quality, excludedDays: 1, outlierWeighIns: 2 },
        'behind'
      )
    ).toEqual([
      { kind: 'excludedDays', count: 1 },
      { kind: 'outliers', count: 2 },
    ]);
  });

  it('is empty for clean data', () => {
    expect(
      coachingDataNotes(
        { ...quality, excludedDays: 0, outlierWeighIns: 0 },
        'on-track'
      )
    ).toEqual([]);
  });
});

/** Weigh-ins with a repeatable pseudo-random error of up to +/- `noiseKg`. */
function noisyWeighIns(
  kgPerWeek: number,
  noiseKg: number,
  every: number
): CoachingWeighIn[] {
  let seed = 12345;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
  const out: CoachingWeighIn[] = [];
  for (let d = 0; d < DAYS; d += every) {
    out.push({
      date: addDays(START, d),
      weightKg: 80 + (kgPerWeek / 7) * d + (next() - 0.5) * 2 * noiseKg,
    });
  }
  return out;
}

describe('uncertain estimates', () => {
  // Eating 2000 while spending about 2430: losing 0.5 kg/week against a
  // 0.25 kg/week goal, so a higher target is wanted.
  const noisy = (noiseKg: number, every: number) =>
    checkIn({
      weighIns: noisyWeighIns(-0.5, noiseKg, every),
      rate: 0.25,
    });

  it('takes the whole change when the estimate is steady', () => {
    const steady = checkIn({
      weighIns: weighIns(-0.5, undefined, 0.1),
      rate: 0.25,
    });
    expect(steady.expenditure.marginKcal!).toBeLessThan(150);
    expect(steady.limits).not.toContain('uncertain-estimate');
    expect(steady.suggested).not.toBeNull();
  });

  it('takes only part of the change when the weigh-ins are noisy', () => {
    const steady = checkIn({
      weighIns: weighIns(-0.5, undefined, 0.1),
      rate: 0.25,
    });
    const result = noisy(1.5, 3);
    expect(result.expenditure.marginKcal!).toBeGreaterThan(150);
    if (result.suggested) {
      expect(result.limits).toContain('uncertain-estimate');
      expect(Math.abs(result.changeKcal)).toBeLessThan(
        Math.abs(steady.changeKcal)
      );
    }
  });

  it('suggests nothing when the margin is too large to act on', () => {
    const result = noisy(5, 4);
    expect(result.expenditure.marginKcal!).toBeGreaterThanOrEqual(450);
    expect(result.suggested).toBeNull();
    expect(result.actionable).toBe(false);
    expect(result.limits).toContain('uncertain-estimate');
    // Still reports why it is off track, not a made-up cause.
    expect(['ahead', 'behind']).toContain(result.reason);
  });
});

describe('a day still being logged', () => {
  it('leaves today out of the intake average', () => {
    const full = checkIn();
    const partialToday = checkIn({
      intake: intake(2000).map((d) =>
        d.date === TODAY ? { ...d, calories: 1100 } : d
      ),
    });
    expect(partialToday.expenditure.avgIntakeKcal).toBe(
      full.expenditure.avgIntakeKcal
    );
    expect(partialToday.expenditure.rawKcal).toBe(full.expenditure.rawKcal);
    expect(partialToday.dataQuality.loggedDays).toBe(
      full.dataQuality.loggedDays
    );
  });

  it('does not count today in the adherence window either', () => {
    const onlyToday = checkIn({
      weighIns: [],
      intake: [{ date: TODAY, calories: 2000 }],
    });
    expect(onlyToday.dataQuality.loggedDays).toBe(0);
    expect(onlyToday.dataQuality.windowDays).toBe(0);
  });
});
