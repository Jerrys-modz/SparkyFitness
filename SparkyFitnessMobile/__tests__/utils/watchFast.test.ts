import { toWatchFast } from '../../src/utils/watchFast';

describe('toWatchFast', () => {
  it('keeps "unknown" apart from "not fasting"', () => {
    expect(toWatchFast(undefined)).toBeUndefined();
    expect(toWatchFast(null)).toBeNull();
  });

  it('turns the fast into epoch milliseconds', () => {
    expect(
      toWatchFast({
        start_time: '2026-10-03T08:00:00.000Z',
        target_end_time: '2026-10-04T00:00:00.000Z',
        fasting_type: '16:8',
      } as never)
    ).toEqual({
      startedAt: Date.parse('2026-10-03T08:00:00.000Z'),
      targetEndAt: Date.parse('2026-10-04T00:00:00.000Z'),
      label: '16:8',
    });
  });

  it('allows an open-ended fast and ignores a broken start time', () => {
    expect(
      toWatchFast({
        start_time: '2026-10-03T08:00:00.000Z',
        target_end_time: null,
        fasting_type: null,
      } as never)
    ).toMatchObject({ targetEndAt: null, label: null });
    expect(toWatchFast({ start_time: 'nonsense' } as never)).toBeNull();
  });
});
