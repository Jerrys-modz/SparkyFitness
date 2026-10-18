import {
  isPendingEntryId,
  overlayCheckIn,
  overlayDailySummary,
  pendingEntryId,
  queueIdOfPendingEntry,
} from '../../../src/services/offlineQueue/overlay';
import type { DailySummaryRawData } from '../../../src/services/dailySummaryService';
import { checkInItem, foodItem, waterItem } from '../../helpers/offlineQueue';

const raw = (): DailySummaryRawData =>
  ({
    goals: {},
    foodEntries: [
      { id: 'server-1', calories: 50, serving_size: 1, quantity: 1 },
    ],
    exerciseEntries: [],
    waterIntake: { water_ml: 500 },
    stepCalories: 0,
  }) as unknown as DailySummaryRawData;

describe('pending entry ids', () => {
  it('round-trips and never matches a server id', () => {
    expect(isPendingEntryId(pendingEntryId('abc'))).toBe(true);
    expect(queueIdOfPendingEntry(pendingEntryId('abc'))).toBe('abc');
    expect(isPendingEntryId('3f2a-uuid')).toBe(false);
    expect(isPendingEntryId(undefined)).toBe(false);
  });
});

describe('overlayDailySummary', () => {
  it('returns the same object when nothing is waiting for the day', () => {
    const data = raw();
    expect(overlayDailySummary(data, [], '2026-10-17')).toBe(data);
    expect(
      overlayDailySummary(
        data,
        [foodItem('a', undefined, { entryDate: '2026-10-16' })],
        '2026-10-17'
      )
    ).toBe(data);
  });

  it('adds queued food and water without mutating the cached data', () => {
    const data = raw();
    const out = overlayDailySummary(
      data,
      [
        foodItem('a'),
        waterItem('w', undefined, 250),
        waterItem('w2', undefined, 250),
      ],
      '2026-10-17'
    );
    expect(out.foodEntries.map((e) => e.id)).toEqual(['server-1', 'pending:a']);
    expect(out.waterIntake.water_ml).toBe(1000);
    expect(data.foodEntries).toHaveLength(1);
    expect(data.waterIntake.water_ml).toBe(500);
  });

  it('skips a water press whose amount only the server can tell', () => {
    const data = raw();
    expect(
      overlayDailySummary(data, [waterItem('w', undefined, null)], '2026-10-17')
    ).toBe(data);
  });

  it('does not add an entry twice if the server data already holds it', () => {
    const data = raw();
    data.foodEntries.push({ id: 'pending:a' } as never);
    const out = overlayDailySummary(data, [foodItem('a')], '2026-10-17');
    expect(out).toBe(data);
  });
});

describe('overlayCheckIn', () => {
  it('returns the measurement untouched with nothing queued', () => {
    const m = { entry_date: '2026-10-17', weight: 81 };
    expect(overlayCheckIn(m, [], '2026-10-17')).toBe(m);
  });

  it('applies queued values oldest first over the cached ones', () => {
    const out = overlayCheckIn(
      { entry_date: '2026-10-17', weight: 81, waist: 90 },
      [checkInItem('a', undefined, 80), checkInItem('b', undefined, 79.5)],
      '2026-10-17'
    );
    expect(out).toMatchObject({ weight: 79.5, waist: 90 });
  });

  it('builds a measurement when none is cached', () => {
    expect(
      overlayCheckIn(undefined, [checkInItem('a')], '2026-10-17')
    ).toMatchObject({
      entry_date: '2026-10-17',
      weight: 80,
    });
  });

  it('lets a queued null clear a value', () => {
    const item = checkInItem('a');
    item.payload = { entryDate: '2026-10-17', weight: null };
    expect(
      overlayCheckIn(
        { entry_date: '2026-10-17', weight: 81 },
        [item],
        '2026-10-17'
      )?.weight
    ).toBeNull();
  });
});
