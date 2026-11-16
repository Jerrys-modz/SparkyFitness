import { describe, expect, it } from 'vitest';
import {
  addDays,
  detectWeightPlateau,
  isWeightPlateauDismissed,
  PLATEAU_MIN_DAYS,
  weightGoalDirection,
  type WeightSample,
} from '@workspace/shared';

const START = '2026-09-01';

/** One weigh-in every `every` days, weight from `weightAt(dayIndex)`. */
function series(
  days: number,
  weightAt: (day: number) => number,
  every = 1
): WeightSample[] {
  const out: WeightSample[] = [];
  for (let d = 0; d < days; d += every) {
    out.push({ date: addDays(START, d), weight: weightAt(d) });
  }
  return out;
}

// A loss of 0.5 kg/week for the first 30 days, then flat with small noise.
const lossThenFlat = series(60, (d) =>
  d < 30 ? 85 - (0.5 / 7) * d : 85 - (0.5 / 7) * 30 + (d % 2 === 0 ? 0.2 : -0.2)
);

describe('weightGoalDirection', () => {
  it('maps the Goal Modes onto a direction', () => {
    expect(weightGoalDirection({ goal_mode: 'cut' })).toBe('lose');
    expect(weightGoalDirection({ goal_mode: 'high_cut' })).toBe('lose');
    expect(weightGoalDirection({ goal_mode: 'lean_bulk' })).toBe('gain');
    expect(weightGoalDirection({ goal_mode: 'bulk' })).toBe('gain');
    expect(weightGoalDirection({ goal_mode: 'maintain' })).toBe('none');
    expect(weightGoalDirection({ goal_mode: 'recomp' })).toBe('none');
    expect(weightGoalDirection(null)).toBe('none');
  });

  it('follows the sign of manual and weekly goals', () => {
    expect(
      weightGoalDirection({
        goal_mode: 'manual',
        goal_mode_custom_percentage: -15,
      })
    ).toBe('lose');
    expect(
      weightGoalDirection({
        goal_mode: 'manual',
        goal_mode_custom_percentage: 10,
      })
    ).toBe('gain');
    expect(
      weightGoalDirection({
        goal_mode: 'manual',
        goal_mode_custom_percentage: 0,
      })
    ).toBe('none');
    expect(
      weightGoalDirection({
        goal_mode: 'weekly',
        goal_mode_weekly_change_kg: -0.5,
      })
    ).toBe('lose');
    expect(
      weightGoalDirection({
        goal_mode: 'weekly',
        goal_mode_weekly_change_kg: 0.25,
      })
    ).toBe('gain');
    expect(
      weightGoalDirection({
        goal_mode: 'weekly',
        goal_mode_weekly_change_kg: 0,
      })
    ).toBe('none');
  });
});

describe('detectWeightPlateau', () => {
  it('finds a flat stretch after a loss', () => {
    const plateau = detectWeightPlateau(lossThenFlat, 'lose');
    expect(plateau).not.toBeNull();
    expect(plateau!.endDate).toBe(addDays(START, 59));
    // Flat for the last 30 days; the stretch may reach a couple of days into
    // the tail of the loss while the trend stays inside the band.
    expect(plateau!.days).toBeGreaterThanOrEqual(PLATEAU_MIN_DAYS);
    expect(plateau!.days).toBeLessThanOrEqual(34);
    expect(plateau!.weighIns).toBe(plateau!.days);
    expect(Math.abs(plateau!.weeklyRate)).toBeLessThan(0.08);
    expect(plateau!.direction).toBe('lose');
  });

  it('ignores maintenance and recomposition', () => {
    expect(detectWeightPlateau(lossThenFlat, 'none')).toBeNull();
  });

  it('does not flag a trend that is still moving', () => {
    const losing = series(60, (d) => 85 - (0.4 / 7) * d);
    expect(detectWeightPlateau(losing, 'lose')).toBeNull();
  });

  it('does not flag a flat stretch shorter than the minimum', () => {
    const shortFlat = series(40, (d) =>
      d < 30 ? 85 - (0.5 / 7) * d : 85 - (0.5 / 7) * 30
    );
    expect(detectWeightPlateau(shortFlat, 'lose')).toBeNull();
  });

  it('needs enough real weigh-ins, not interpolation', () => {
    const sparse = series(60, () => 80, 10);
    expect(detectWeightPlateau(sparse, 'lose')).toBeNull();
  });

  it('ends the stretch at a long gap between weigh-ins', () => {
    const beforeGap = series(20, () => 80);
    const afterGap = series(10, () => 80).map((s) => ({
      ...s,
      date: addDays(s.date, 40),
    }));
    expect(detectWeightPlateau([...beforeGap, ...afterGap], 'lose')).toBeNull();
  });

  it('does not call a drop that bounced back flat', () => {
    const vShape = series(28, (d) =>
      d < 14 ? 82 - d * 0.15 : 79.9 + (d - 14) * 0.15
    );
    expect(detectWeightPlateau(vShape, 'lose')).toBeNull();
  });

  it('is not current when the last weigh-in is old', () => {
    const today = addDays(START, 59 + 8);
    expect(detectWeightPlateau(lossThenFlat, 'lose', { today })).toBeNull();
    expect(
      detectWeightPlateau(lossThenFlat, 'lose', { today: addDays(START, 62) })
    ).not.toBeNull();
  });

  it('works in any consistent unit', () => {
    const lbs = lossThenFlat.map((s) => ({ ...s, weight: s.weight * 2.20462 }));
    const kg = detectWeightPlateau(lossThenFlat, 'gain');
    const lb = detectWeightPlateau(lbs, 'gain');
    expect(lb?.days).toBe(kg?.days);
  });
});

describe('isWeightPlateauDismissed', () => {
  it('keeps the same plateau hidden and shows a new one', () => {
    expect(isWeightPlateauDismissed({ startDate: '2026-10-01' }, null)).toBe(
      false
    );
    expect(
      isWeightPlateauDismissed({ startDate: '2026-10-01' }, '2026-10-20')
    ).toBe(true);
    expect(
      isWeightPlateauDismissed({ startDate: '2026-10-21' }, '2026-10-20')
    ).toBe(false);
  });
});
