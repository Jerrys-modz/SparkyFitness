import {
  dailyMoodSeries,
  summarizeCheckins,
  type MoodRowLike,
} from '@workspace/shared';

const row = (
  entry_date: string,
  source: MoodRowLike['source'],
  mood_value: number | null,
  energy_value: number | null = null,
  focus_value: number | null = null
): MoodRowLike => ({
  entry_date,
  source,
  mood_value,
  energy_value,
  focus_value,
});

describe('summarizeCheckins', () => {
  test('averages manual rows only and ignores null values', () => {
    const summary = summarizeCheckins([
      row('2026-10-20', 'manual', 40, 2),
      row('2026-10-20', 'manual', 80, 3),
      row('2026-10-20', 'manual', null),
      row('2026-10-20', 'garmin', 10, 5, 5),
    ]);
    expect(summary).toEqual({ mood: 60, energy: 2.5, focus: null, count: 3 });
  });

  test('returns nulls and zero count for no manual rows', () => {
    expect(summarizeCheckins([row('2026-10-20', 'garmin', 30)])).toEqual({
      mood: null,
      energy: null,
      focus: null,
      count: 0,
    });
  });
});

describe('dailyMoodSeries', () => {
  test('prefers manual over garmin over import, skips days without a mood', () => {
    const series = dailyMoodSeries([
      row('2026-10-03', 'manual', null),
      row('2026-10-02', 'import', 50),
      row('2026-10-02', 'garmin', 20),
      row('2026-10-01', 'garmin', 30),
      row('2026-10-01', 'manual', 40),
      row('2026-10-01', 'manual', 81),
      row('2026-10-01', 'manual', null),
      row('2026-09-30', 'garmin', 30),
    ]);
    expect(series).toEqual([
      { date: '2026-09-30', mood_value: 30 },
      { date: '2026-10-01', mood_value: 61 },
      { date: '2026-10-02', mood_value: 20 },
    ]);
  });
});
