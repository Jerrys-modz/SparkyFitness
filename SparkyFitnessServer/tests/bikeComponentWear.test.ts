import { describe, expect, it } from 'vitest';
import { computeComponentWear } from '@workspace/shared';

describe('computeComponentWear', () => {
  it('is ok below 80%, due soon from 80%, due now from 100%', () => {
    const wear = (distanceKm: number) =>
      computeComponentWear({
        distanceKm,
        hours: 0,
        expectedLifeKm: 1000,
        expectedLifeHours: null,
      });
    expect(wear(799)).toEqual({ wearPercent: 79.9, state: 'ok' });
    expect(wear(800).state).toBe('due_soon');
    expect(wear(1000).state).toBe('due_now');
    expect(wear(1300).wearPercent).toBe(130);
  });

  it('uses the larger of the distance and hours ratios', () => {
    const result = computeComponentWear({
      distanceKm: 100,
      hours: 90,
      expectedLifeKm: 1000,
      expectedLifeHours: 100,
    });
    expect(result).toEqual({ wearPercent: 90, state: 'due_soon' });
  });

  it('works with hours only and never divides by a missing limit', () => {
    expect(
      computeComponentWear({
        distanceKm: 5000,
        hours: 50,
        expectedLifeKm: null,
        expectedLifeHours: 100,
      }).wearPercent
    ).toBe(50);
    expect(
      computeComponentWear({
        distanceKm: 5000,
        hours: 50,
        expectedLifeKm: null,
        expectedLifeHours: null,
      })
    ).toEqual({ wearPercent: 0, state: 'ok' });
  });
});
