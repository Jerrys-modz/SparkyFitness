import {
  afterEach,
  beforeEach,
  describe,
  expect,
  expectTypeOf,
  it,
  vi,
} from 'vitest';
import {
  compareQuerySchema,
  compareResponseSchema,
  compareResultSchema,
  type CompareResult,
} from '@workspace/shared';
import type { z } from 'zod';
import compareRepository from '../models/compareRepository.js';
import { getClient } from '../db/poolManager.js';

vi.mock('../db/poolManager', () => ({
  getClient: vi.fn(),
}));

describe('compareQuerySchema', () => {
  const base = {
    a: 'mood',
    b: 'timeAsleep',
    start: '2026-01-01',
    end: '2026-03-01',
  };
  const issues = (input: unknown) => {
    const r = compareQuerySchema.safeParse(input);
    return r.success ? [] : r.error.issues.map((i) => i.message);
  };

  it('accepts the defaults', () => {
    const r = compareQuerySchema.parse(base);
    expect(r.mode).toBe('day');
    expect(r.timing).toBe(0);
  });

  it('coerces timing from a query string', () => {
    expect(compareQuerySchema.parse({ ...base, timing: '-1' }).timing).toBe(-1);
  });

  it('rejects the same metric twice', () => {
    expect(issues({ ...base, b: 'mood' }).join()).toMatch(/different/i);
  });

  it('rejects an unknown metric', () => {
    expect(issues({ ...base, a: 'nope' }).length).toBeGreaterThan(0);
  });

  it('rejects start after end', () => {
    expect(
      issues({ ...base, start: '2026-03-02', end: '2026-03-01' }).join()
    ).toMatch(/start/i);
  });

  // Span is counted inclusively: 2026-01-01 .. 2026-06-29 is 180 days.
  it('accepts a 180-day span and rejects 181', () => {
    expect(
      compareQuerySchema.safeParse({ ...base, end: '2026-06-29' }).success
    ).toBe(true);
    expect(issues({ ...base, end: '2026-06-30' }).join()).toMatch(/180/);
  });

  it('allows up to 366 days in week mode and rejects 367', () => {
    const wk = { ...base, mode: 'week' };
    expect(
      compareQuerySchema.safeParse({ ...wk, end: '2027-01-01' }).success
    ).toBe(true);
    expect(issues({ ...wk, end: '2027-01-02' }).join()).toMatch(/366/);
  });

  it('rejects timing -1 in week mode', () => {
    expect(issues({ ...base, mode: 'week', timing: -1 }).join()).toMatch(
      /timing/i
    );
  });

  it('rejects a metric with no weekly form in week mode', () => {
    expect(
      issues({ ...base, mode: 'week', b: 'meditationSessions7d' }).join()
    ).toMatch(/week/i);
    expect(
      compareQuerySchema.safeParse({ ...base, b: 'meditationSessions7d' })
        .success
    ).toBe(true);
  });
});

describe('compare response schema', () => {
  it('mirrors CompareResult', () => {
    expectTypeOf<
      z.infer<typeof compareResultSchema>
    >().toEqualTypeOf<CompareResult>();
    expect(
      compareResponseSchema.safeParse({
        a: { key: 'mood', values: { '2026-01-01': 3 } },
        b: { key: 'steps', values: {} },
        deviations: { a: {}, b: {} },
        result: {
          status: 'not_enough',
          n: 0,
          needed: 14,
          reason: 'tooFew',
          checks: { ownNormal: true },
        },
      }).success
    ).toBe(true);
  });
});

describe('compareRepository', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockClient: any;
  const run = async (
    rows: Record<string, unknown>[],
    fn: () => Promise<unknown>
  ) => {
    mockClient.query.mockResolvedValue({ rows });
    return fn();
  };
  const sqlOf = () => mockClient.query.mock.calls[0][0] as string;
  const paramsOf = () => mockClient.query.mock.calls[0][1] as unknown[];

  beforeEach(() => {
    mockClient = { query: vi.fn(), release: vi.fn() };
    // @ts-expect-error mock typing
    getClient.mockResolvedValue(mockClient);
  });
  afterEach(() => vi.clearAllMocks());

  it('mood: manual rows only, numbers mapped, nulls kept', async () => {
    const out = await run(
      [{ day: '2026-01-01', mood: '4', energy: '3.5', focus: null }],
      () =>
        compareRepository.getManualMoodDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    expect(sqlOf()).toContain("source = 'manual'");
    expect(sqlOf()).toContain("TO_CHAR(entry_date, 'YYYY-MM-DD')");
    expect(paramsOf()).toEqual(['u1', '2026-01-01', '2026-01-31']);
    expect(out).toEqual([
      { day: '2026-01-01', mood: 4, energy: 3.5, focus: null },
    ]);
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('sleep: longest sleep per day, mapped', async () => {
    const out = await run(
      [
        {
          day: '2026-01-01',
          time_asleep_seconds: '25000',
          sleep_score: '81',
          overnight_hrv: null,
          resting_heart_rate: '52.5',
          bedtime: '2026-01-01T06:00:00.000Z',
          record_timezone: 'Europe/Oslo',
          record_utc_offset_minutes: '60',
        },
      ],
      () => compareRepository.getMainSleepDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    expect(sqlOf()).toContain('DISTINCT ON (entry_date)');
    expect(sqlOf()).toContain('duration_in_seconds DESC');
    expect(sqlOf()).toContain("TO_CHAR(entry_date, 'YYYY-MM-DD')");
    expect(out).toEqual([
      {
        day: '2026-01-01',
        timeAsleepSeconds: 25000,
        sleepScore: 81,
        overnightHrv: null,
        restingHeartRate: 52.5,
        bedtime: '2026-01-01T06:00:00.000Z',
        recordTimezone: 'Europe/Oslo',
        recordUtcOffsetMinutes: 60,
      },
    ]);
  });

  it('meditation days and first day', async () => {
    const out = await run(
      [{ day: '2026-01-01', minutes: '12.5', sessions: '2' }],
      () =>
        compareRepository.getMeditationDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    expect(sqlOf()).toContain("TO_CHAR(entry_date, 'YYYY-MM-DD')");
    expect(out).toEqual([{ day: '2026-01-01', minutes: 12.5, sessions: 2 }]);

    mockClient.query.mockClear();
    expect(
      await run([{ day: '2025-12-01' }], () =>
        compareRepository.getMeditationFirstDay('u1')
      )
    ).toBe('2025-12-01');
    expect(sqlOf()).toContain('MIN(entry_date)');
    expect(paramsOf()).toEqual(['u1']);
    mockClient.query.mockClear();
    expect(
      await run([{ day: null }], () =>
        compareRepository.getMeditationFirstDay('u1')
      )
    ).toBeNull();
  });

  it('cardio minutes', async () => {
    const out = await run([{ day: '2026-01-02', minutes: '30' }], () =>
      compareRepository.getCardioMinuteDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    expect(sqlOf()).toContain("LOWER(category) = 'cardio'");
    expect(sqlOf()).toContain("exercise_name != 'Active Calories'");
    expect(sqlOf()).toContain("TO_CHAR(entry_date, 'YYYY-MM-DD')");
    expect(out).toEqual([{ day: '2026-01-02', minutes: 30 }]);
  });

  it('strength volume uses the shared set load SQL', async () => {
    const out = await run([{ day: '2026-01-02', volume_kg: '1234.5' }], () =>
      compareRepository.getStrengthVolumeDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    expect(sqlOf()).toContain('bodyweight_reps');
    expect(sqlOf()).toContain('LATERAL');
    expect(sqlOf()).toContain("exercise_name != 'Active Calories'");
    expect(sqlOf()).toContain("TO_CHAR(e.entry_date, 'YYYY-MM-DD')");
    expect(out).toEqual([{ day: '2026-01-02', volumeKg: 1234.5 }]);
  });

  it('exercise first day', async () => {
    expect(
      await run([{ day: '2025-11-03' }], () =>
        compareRepository.getExerciseFirstDay('u1')
      )
    ).toBe('2025-11-03');
    expect(sqlOf()).toContain('MIN(entry_date)');
  });

  it('check-ins map weight and steps', async () => {
    const out = await run(
      [
        { day: '2026-01-01', weight: '80.2', steps: 9000 },
        { day: '2026-01-02', weight: null, steps: null },
      ],
      () => compareRepository.getCheckInDays('u1', '2026-01-01', '2026-01-31')
    );
    expect(sqlOf()).toContain('user_id = $1');
    expect(sqlOf()).toContain("TO_CHAR(entry_date, 'YYYY-MM-DD')");
    expect(out).toEqual([
      { day: '2026-01-01', weight: 80.2, steps: 9000 },
      { day: '2026-01-02', weight: null, steps: null },
    ]);
  });
});
