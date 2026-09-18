import { vi, beforeEach, describe, expect, it } from 'vitest';
import exerciseRepository from '../models/exercise.js';
import exerciseEntryRepository from '../models/exerciseEntry.js';
import sleepRepository from '../models/sleepRepository.js';
import measurementRepository from '../models/measurementRepository.js';
import * as genericHealthRepository from '../models/genericHealthRepository.js';
import {
  hypnogramStageStartMs,
  processPolarActivity,
  processPolarExercises,
  processPolarNightlyRecharge,
  processPolarPhysicalInfo,
  processPolarSleep,
  resolvePolarActivityDate,
  resolvePolarActivitySteps,
} from '../integrations/polar/polarDataProcessor.js';

vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/measurementRepository.js', () => ({
  default: {
    upsertStepData: vi.fn(),
    upsertCheckInMeasurements: vi.fn(),
    getCustomCategories: vi.fn(),
    createCustomCategory: vi.fn(),
    upsertCustomMeasurement: vi.fn(),
  },
}));
vi.mock('../models/genericHealthRepository.js', () => ({
  upsertDailyHealthMetrics: vi.fn(),
}));
vi.mock('../models/exercise.js', () => ({
  default: {
    getExerciseBySourceAndSourceId: vi.fn(),
    searchExercises: vi.fn(),
    createExercise: vi.fn(),
  },
}));
vi.mock('../models/exerciseEntry.js', () => ({
  default: {
    deleteExerciseEntriesByEntrySourceAndDate: vi.fn(),
    createExerciseEntry: vi.fn(),
  },
}));
vi.mock('../models/sleepRepository.js', () => ({
  default: {
    upsertSleepEntry: vi.fn(),
    deleteSleepStageEventsByEntryId: vi.fn(),
    upsertSleepStageEvent: vi.fn(),
  },
}));
vi.mock('../models/activityDetailsRepository.js', () => ({
  default: { createActivityDetail: vi.fn() },
}));

const UID = 'user-1';
const CID = 'user-1';

describe('processPolarExercises duration units', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(
      exerciseRepository.getExerciseBySourceAndSourceId
    ).mockResolvedValue({ id: 'exercise-1', name: 'Running' });
    vi.mocked(exerciseEntryRepository.createExerciseEntry).mockResolvedValue({
      id: 'entry-1',
    });
  });

  it('stores entry duration in minutes and set duration in integer seconds (issue #1903)', async () => {
    await processPolarExercises(UID, CID, [
      {
        id: 42,
        'start-time': '2026-07-15T10:00:00',
        duration: 'PT30M',
        calories: 300,
        distance: 5000,
        sport: 'RUNNING',
        'detailed-sport-info': 'Running',
      },
    ] as Parameters<typeof processPolarExercises>[2]);

    expect(exerciseEntryRepository.createExerciseEntry).toHaveBeenCalledWith(
      UID,
      expect.objectContaining({
        duration_minutes: 30,
        sets: [expect.objectContaining({ duration: 1800 })],
      }),
      CID,
      'Polar'
    );
  });
});

describe('processPolarSleep recording-zone stamp (issue #2033)', () => {
  // processPolarSleep's untyped `sleepData = []` default infers never[].
  const night = (startTime: string) =>
    ({
      date: '2026-07-15',
      'sleep-start-time': startTime,
      'sleep-end-time': '2026-07-15T07:00:00+03:00',
      'light-sleep': 15000,
      'deep-sleep': 6000,
      'rem-sleep': 6000,
      'total-interruption-duration': 1800,
      'sleep-score': 80,
    }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sleepRepository.upsertSleepEntry).mockResolvedValue({
      id: 'sleep-1',
    });
  });

  it('stamps the offset from the raw offset-suffixed sleep-start-time', async () => {
    await processPolarSleep(UID, CID, [night('2026-07-14T23:39:07+03:00')]);
    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry.record_utc_offset_minutes).toBe(180);
  });

  it('omits the stamp for a naive sleep-start-time (no zone claim)', async () => {
    await processPolarSleep(UID, CID, [night('2026-07-14T23:39:07')]);
    const entry = vi.mocked(sleepRepository.upsertSleepEntry).mock.calls[0][2];
    expect(entry.record_utc_offset_minutes).toBeUndefined();
  });
});

describe('processPolarSleep hypnogram stages (issue #2431)', () => {
  // A night recorded at UTC+03:00: bedtime 23:39:07, wake 07:00 local, with the
  // hypnogram keyed by wall-clock HH:MM in that zone. Expected instants are in
  // UTC and must not depend on the zone this test process runs in.
  const night = {
    date: '2026-07-15',
    'sleep-start-time': '2026-07-14T23:39:07+03:00',
    'sleep-end-time': '2026-07-15T07:00:00+03:00',
    'light-sleep': 15000,
    'deep-sleep': 6000,
    'rem-sleep': 6000,
    'total-interruption-duration': 1800,
    'sleep-score': 80,
    hypnogram: { '23:39': 0, '23:50': 4, '02:10': 1, '06:40': 0 },
  } as never;

  const stageCalls = () =>
    vi.mocked(sleepRepository.upsertSleepStageEvent).mock.calls.map(
      (call) =>
        call[2] as {
          stage_type: string;
          start_time: string;
          end_time: string;
          duration_in_seconds: number;
        }
    );

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sleepRepository.upsertSleepEntry).mockResolvedValue({
      id: 'sleep-1',
    });
  });

  it('anchors every stage in the recording zone and ends the last one at wake time', async () => {
    await processPolarSleep(UID, CID, [night]);
    expect(stageCalls()).toEqual([
      {
        stage_type: 'awake',
        start_time: '2026-07-14T20:39:07.000Z',
        end_time: '2026-07-14T20:50:00.000Z',
        duration_in_seconds: 653,
      },
      {
        stage_type: 'deep',
        start_time: '2026-07-14T20:50:00.000Z',
        end_time: '2026-07-14T23:10:00.000Z',
        duration_in_seconds: 8400,
      },
      {
        stage_type: 'rem',
        start_time: '2026-07-14T23:10:00.000Z',
        end_time: '2026-07-15T03:40:00.000Z',
        duration_in_seconds: 16200,
      },
      {
        stage_type: 'awake',
        start_time: '2026-07-15T03:40:00.000Z',
        end_time: '2026-07-15T04:00:00.000Z',
        duration_in_seconds: 1200,
      },
    ]);
  });

  it('keeps the stage total inside the recorded night', async () => {
    await processPolarSleep(UID, CID, [night]);
    const stages = stageCalls();
    const total = stages.reduce((sum, s) => sum + s.duration_in_seconds, 0);
    const nightSeconds =
      (Date.parse('2026-07-15T07:00:00+03:00') -
        Date.parse('2026-07-14T23:39:07+03:00')) /
      1000;
    expect(total).toBe(nightSeconds);
    expect(stages.at(-1)?.end_time).toBe('2026-07-15T04:00:00.000Z');
  });

  it('clamps stages to the wake time and drops one that starts after it', async () => {
    await processPolarSleep(UID, CID, [
      { ...(night as object), hypnogram: { '23:39': 4, '07:30': 0 } } as never,
    ]);
    const stages = stageCalls();
    expect(stages.map((s) => s.stage_type)).toEqual(['deep']);
    expect(stages[0].end_time).toBe('2026-07-15T04:00:00.000Z');
  });

  it('orders stages by instant, not by clock string, across midnight', async () => {
    // Keys handed over in a scrambled order: the night is 23:39 → 23:50 → 02:10 → 06:40.
    await processPolarSleep(UID, CID, [
      {
        ...(night as object),
        hypnogram: [
          { time: '06:40', value: 0 },
          { time: '23:50', value: 4 },
          { time: '02:10', value: 1 },
          { time: '23:39', value: 0 },
        ],
      } as never,
    ]);
    expect(stageCalls().map((s) => [s.stage_type, s.start_time])).toEqual([
      ['awake', '2026-07-14T20:39:07.000Z'],
      ['deep', '2026-07-14T20:50:00.000Z'],
      ['rem', '2026-07-14T23:10:00.000Z'],
      ['awake', '2026-07-15T03:40:00.000Z'],
    ]);
  });
});

describe('hypnogramStageStartMs', () => {
  const bedtime = Date.parse('2026-07-14T23:39:07+03:00');

  it('places a key on the anchor day in the recording zone', () => {
    expect(hypnogramStageStartMs('23:39', bedtime, 180)).toBe(
      Date.parse('2026-07-14T23:39:00+03:00')
    );
  });

  it('rolls a key that reads earlier than the anchor onto the next day', () => {
    expect(hypnogramStageStartMs('00:05', bedtime, 180)).toBe(
      Date.parse('2026-07-15T00:05:00+03:00')
    );
    expect(hypnogramStageStartMs('06:40', bedtime, 180)).toBe(
      Date.parse('2026-07-15T06:40:00+03:00')
    );
  });

  it('works for a negative offset and for a naive (UTC) record', () => {
    const west = Date.parse('2026-07-14T22:30:00-05:00');
    expect(hypnogramStageStartMs('22:30', west, -300)).toBe(west);
    expect(hypnogramStageStartMs('06:10', west, -300)).toBe(
      Date.parse('2026-07-15T06:10:00-05:00')
    );
    const naive = Date.parse('2026-07-14T21:00:00Z');
    expect(hypnogramStageStartMs('03:15', naive, 0)).toBe(
      Date.parse('2026-07-15T03:15:00Z')
    );
  });
});

describe('processPolarActivity daily metrics (issue #2471)', () => {
  // The real payload shape from /users/activities: start_time/end_time, no `date`.
  // processPolarActivity's untyped `activities = []` default infers never[].
  const activity = (overrides: Record<string, unknown> = {}) =>
    ({
      start_time: '2026-09-13T00:00',
      end_time: '2026-09-13T23:56',
      calories: 2635,
      active_calories: 964,
      steps: 8154,
      distance_from_steps: 4682.88,
      ...overrides,
    }) as never;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([
      { id: 'cat-active', name: 'Active Calories' },
      { id: 'cat-daily', name: 'Daily Calories' },
    ]);
  });

  it('writes steps to check_in_measurements, not a custom category', async () => {
    await processPolarActivity(UID, CID, [activity()]);

    expect(measurementRepository.upsertStepData).toHaveBeenCalledWith(
      UID,
      CID,
      8154,
      '2026-09-13'
    );
    // The old "Steps" custom category must no longer be created or written.
    expect(measurementRepository.createCustomCategory).not.toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Steps' })
    );
  });

  it('writes a polar daily_health_metrics summary with distance in metres', async () => {
    await processPolarActivity(UID, CID, [activity()]);

    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({
        user_id: UID,
        entry_date: '2026-09-13',
        source_provider: 'polar',
        total_steps: 8154,
        // Polar already reports metres; it must not be scaled like Garmin's km.
        total_distance_meters: 4682.88,
        active_calories: 964,
        total_calories: 2635,
        // total_calories is only advanced when its capture time comes with it.
        total_calories_captured_at: expect.any(Date),
      })
    );
  });

  it('keeps logging calories as custom measurements', async () => {
    await processPolarActivity(UID, CID, [activity()]);

    const categoryIds = vi
      .mocked(measurementRepository.upsertCustomMeasurement)
      .mock.calls.map((call) => call[2]);
    expect(categoryIds).toEqual(['cat-active', 'cat-daily']);
  });

  it("orders total_calories by Polar's end_time, not local processing time", async () => {
    // The upsert only advances total_calories on a strictly newer stamp. Polar's
    // end_time advances as the current day accumulates, so re-syncs progress;
    // local processing time would not be safe because the hourly cron and the
    // manual route run concurrently with no serialization, so a slow older
    // response can land last and would clobber fresher calories.
    await processPolarActivity(UID, CID, [
      activity({ end_time: '2026-09-13T17:43:30' }),
    ]);

    const stamp = vi.mocked(genericHealthRepository.upsertDailyHealthMetrics)
      .mock.calls[0][2].total_calories_captured_at as Date;

    expect(stamp.toISOString()).toBe('2026-09-13T17:43:30.000Z');
  });

  it('advances the calorie stamp as the day accumulates', async () => {
    await processPolarActivity(UID, CID, [
      activity({ end_time: '2026-09-13T12:00:00' }),
    ]);
    await processPolarActivity(UID, CID, [
      activity({ end_time: '2026-09-13T18:00:00' }),
    ]);

    const calls = vi.mocked(genericHealthRepository.upsertDailyHealthMetrics)
      .mock.calls;
    const first = calls[0][2].total_calories_captured_at as Date;
    const second = calls[1][2].total_calories_captured_at as Date;

    expect(second.getTime()).toBeGreaterThan(first.getTime());
  });

  it('records a zero-step day rather than skipping it', async () => {
    await processPolarActivity(UID, CID, [
      activity({ steps: 0, calories: 0, active_calories: 0 }),
    ]);

    expect(measurementRepository.upsertStepData).toHaveBeenCalledWith(
      UID,
      CID,
      0,
      '2026-09-13'
    );
  });

  it('processes every day it is given, one row per date', async () => {
    await processPolarActivity(UID, CID, [
      activity({ start_time: '2026-09-13T00:00', steps: 8154 }),
      activity({ start_time: '2026-09-14T00:00', steps: 4762 }),
      activity({ start_time: '2026-09-15T00:00', steps: 3445 }),
    ]);

    expect(
      vi
        .mocked(measurementRepository.upsertStepData)
        .mock.calls.map((call) => [call[3], call[2]])
    ).toEqual([
      ['2026-09-13', 8154],
      ['2026-09-14', 4762],
      ['2026-09-15', 3445],
    ]);
  });
});

describe('polar daily_health_metrics merge sources (issue #2471)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(measurementRepository.getCustomCategories).mockResolvedValue([]);
    vi.mocked(measurementRepository.createCustomCategory).mockResolvedValue({
      id: 'cat-new',
    });
  });

  it('records overnight average HR as the daily resting heart rate', async () => {
    await processPolarNightlyRecharge(UID, CID, [
      { date: '2026-09-09', 'heart-rate-avg': 53 },
    ] as never[]);

    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({
        entry_date: '2026-09-09',
        source_provider: 'polar',
        resting_heart_rate: 53,
      })
    );
  });

  it('records VO2 max from physical information', async () => {
    await processPolarPhysicalInfo(UID, CID, [
      { created: '2026-09-09T10:00:00', 'vo2-max': 47 },
    ] as never[]);

    expect(
      genericHealthRepository.upsertDailyHealthMetrics
    ).toHaveBeenCalledWith(
      UID,
      CID,
      expect.objectContaining({
        entry_date: '2026-09-09',
        source_provider: 'polar',
        vo2_max: 47,
      })
    );
  });
});

describe('resolvePolarActivityDate / resolvePolarActivitySteps', () => {
  it('falls back to start_time when the record carries no date', () => {
    expect(resolvePolarActivityDate({ start_time: '2026-09-08T13:20' })).toBe(
      '2026-09-08'
    );
    expect(resolvePolarActivityDate({ date: '2026-09-08' })).toBe('2026-09-08');
    expect(
      resolvePolarActivityDate({ end_time: '2026-09-08T23:57' })
    ).toBeNull();
  });

  it('reads steps from either field and preserves zero', () => {
    expect(resolvePolarActivitySteps({ steps: 3445 })).toBe(3445);
    expect(resolvePolarActivitySteps({ 'active-steps': 12 })).toBe(12);
    expect(resolvePolarActivitySteps({ steps: 0 })).toBe(0);
    expect(resolvePolarActivitySteps({})).toBeNull();
  });
});
