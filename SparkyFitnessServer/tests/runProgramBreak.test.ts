import { describe, expect, it } from 'vitest';
import { suggestFromBreak } from '@workspace/shared';

const base = { lastDoneDay: '2026-09-01', next: 5, total: 27 };

describe('suggestFromBreak', () => {
  it('stays quiet for a short break', () => {
    expect(suggestFromBreak({ ...base, today: '2026-09-14' })).toBeNull();
  });

  it('eases two workouts after two weeks', () => {
    expect(suggestFromBreak({ ...base, today: '2026-09-15' })).toEqual({
      daysAway: 14,
      percent: -15,
      count: 2,
    });
  });

  it('eases three workouts after four weeks', () => {
    expect(suggestFromBreak({ ...base, today: '2026-09-29' })).toEqual({
      daysAway: 28,
      percent: -25,
      count: 3,
    });
  });

  it('does nothing before the first workout or after the last', () => {
    expect(
      suggestFromBreak({ ...base, next: 0, today: '2026-10-30' })
    ).toBeNull();
    expect(
      suggestFromBreak({ ...base, next: 27, today: '2026-10-30' })
    ).toBeNull();
    expect(
      suggestFromBreak({ ...base, lastDoneDay: null, today: '2026-10-30' })
    ).toBeNull();
  });

  it('is not offered again once the plan was changed after the last workout', () => {
    expect(
      suggestFromBreak({
        ...base,
        today: '2026-10-01',
        lastAdjustedAt: '2026-09-20T10:00:00.000Z',
      })
    ).toBeNull();
    expect(
      suggestFromBreak({
        ...base,
        today: '2026-10-01',
        lastAdjustedAt: '2026-08-30T10:00:00.000Z',
      })
    ).not.toBeNull();
  });
});
