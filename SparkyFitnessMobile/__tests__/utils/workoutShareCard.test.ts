import {
  buildCompleteShareData,
  SHARE_CARD_MAX_EXERCISES,
  SHARE_CARD_MAX_RECORDS,
  SHARE_CARD_MAX_STATS,
} from '../../src/utils/workoutShareCard';

const t = ((_key: string, opts?: { defaultValue?: string }) =>
  opts?.defaultValue ?? _key) as never;

const summary = (overrides = {}) =>
  ({
    completedSetCount: 12,
    totalSetCount: 12,
    skippedSetCount: 0,
    volumeKg: 5000,
    totalDistanceKm: 0,
    averageRpe: null,
    prRows: [{ exerciseName: 'Bench Press', weightKg: 100, reps: 5 }],
    exercises: [
      { name: 'Bench Press', completedSetCount: 4 },
      { name: 'Skipped', completedSetCount: 0 },
    ],
    ...overrides,
  }) as never;

describe('buildCompleteShareData', () => {
  it('includes time, volume, sets, calories and heart rate when present', () => {
    const data = buildCompleteShareData({
      title: 'Push',
      dateText: 'Friday',
      durationMinutes: 45,
      summary: summary(),
      caloriesValue: 320,
      heartRate: { avgBpm: 120.4, maxBpm: 160 },
      weightUnit: 'kg',
      t,
    });
    expect(data.stats.map((s) => s.label)).toEqual([
      'Time',
      'Volume',
      'Sets',
      'Calories',
      'Avg HR',
      'Max HR',
    ]);
    expect(data.records).toEqual(['Bench Press']);
    expect(data.exercises).toEqual(['Bench Press']);
  });

  it('leaves out stats there is nothing to show for', () => {
    const data = buildCompleteShareData({
      title: 'Walk',
      dateText: 'Friday',
      durationMinutes: 0,
      summary: summary({ volumeKg: 0, prRows: [] }),
      caloriesValue: null,
      heartRate: null,
      weightUnit: 'kg',
      t,
    });
    expect(data.stats.map((s) => s.label)).toEqual(['Sets']);
    expect(data.records).toEqual([]);
  });

  it('caps long lists so the card does not overflow', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      exerciseName: `E${i}`,
      weightKg: 1,
      reps: 1,
    }));
    const data = buildCompleteShareData({
      title: 'Big',
      dateText: '',
      durationMinutes: 10,
      summary: summary({
        prRows: many,
        exercises: many.map((m) => ({
          name: m.exerciseName,
          completedSetCount: 1,
        })),
      }),
      caloriesValue: 100,
      heartRate: { avgBpm: 100, maxBpm: 150 },
      weightUnit: 'kg',
      t,
    });
    expect(data.stats.length).toBeLessThanOrEqual(SHARE_CARD_MAX_STATS);
    expect(data.records).toHaveLength(SHARE_CARD_MAX_RECORDS);
    expect(data.exercises).toHaveLength(SHARE_CARD_MAX_EXERCISES);
  });
});
