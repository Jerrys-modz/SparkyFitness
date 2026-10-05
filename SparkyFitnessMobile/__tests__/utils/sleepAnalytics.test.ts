import { buildSleepAnalytics } from '../../src/utils/sleepAnalytics';
import type { SleepEntry } from '../../src/types/sleep';

const night = (
  day: string,
  overrides: Partial<SleepEntry> = {}
): SleepEntry => ({
  id: day,
  entry_date: day,
  bedtime: `${day}T22:00:00Z`,
  wake_time: `${day}T06:00:00Z`,
  duration_in_seconds: 8 * 3600,
  time_asleep_in_seconds: 7 * 3600,
  sleep_score: null,
  source: 'test',
  deep_sleep_seconds: null,
  light_sleep_seconds: null,
  rem_sleep_seconds: null,
  awake_sleep_seconds: null,
  average_spo2_value: null,
  lowest_spo2_value: null,
  highest_spo2_value: null,
  resting_heart_rate: null,
  record_timezone: null,
  record_utc_offset_minutes: null,
  stage_events: [],
  ...overrides,
});

describe('buildSleepAnalytics', () => {
  it('averages a metric over nights that reported it only', () => {
    const analytics = buildSleepAnalytics(
      [
        night('2026-10-01', { avg_overnight_hrv: 40, sleep_score: 80 }),
        night('2026-10-02', { avg_overnight_hrv: 60 }),
        night('2026-10-03'),
      ],
      '2026-10-01',
      3
    );

    expect(analytics.nightsWithData).toBe(3);
    expect(analytics.averages.hrv).toBe(50);
    expect(analytics.averages.sleepScore).toBe(80);
    expect(analytics.averages.stress).toBeNull();
    expect(analytics.series.hrv.map((p) => p.value)).toEqual([40, 60, 0]);
  });

  it("uses each day's longest session so a nap does not replace the night", () => {
    const analytics = buildSleepAnalytics(
      [
        night('2026-10-01', {
          id: 'nap',
          duration_in_seconds: 1800,
          sleep_score: 10,
        }),
        night('2026-10-01', { id: 'main', sleep_score: 85 }),
      ],
      '2026-10-01',
      1
    );

    expect(analytics.averages.sleepScore).toBe(85);
  });

  it('averages stage seconds over nights that reported them', () => {
    const analytics = buildSleepAnalytics(
      [
        night('2026-10-01', { deep_sleep_seconds: 3600 }),
        night('2026-10-02', { deep_sleep_seconds: 5400 }),
        night('2026-10-03'),
      ],
      '2026-10-01',
      3
    );

    expect(analytics.stages.deepSeconds).toBe(4500);
    expect(analytics.stages.remSeconds).toBeNull();
  });

  it('reports no nights for an empty window', () => {
    const analytics = buildSleepAnalytics([], '2026-10-01', 7);
    expect(analytics.nightsWithData).toBe(0);
    expect(analytics.averages.hrv).toBeNull();
  });
});
