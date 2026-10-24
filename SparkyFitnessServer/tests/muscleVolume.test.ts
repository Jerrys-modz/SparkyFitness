import { describe, expect, it } from 'vitest';
import {
  HARD_SET_MAX_RIR,
  WEEKLY_HARD_SETS_MAX,
  WEEKLY_HARD_SETS_MIN,
  buildMuscleVolume,
  hardSetsByMuscle,
  isHardSet,
  volumeStatus,
} from '@workspace/shared';

// 2026-10-02 is a Friday; with Monday weeks the week starts 2026-09-28.
const TODAY = '2026-10-02';

function entry(
  date: string,
  primary: string[],
  sets: Record<string, unknown>[],
  secondary: string[] = []
) {
  return {
    entry_date: date,
    exercise_name: 'Lift',
    exercise_primary_muscles: JSON.stringify(primary),
    exercise_secondary_muscles: JSON.stringify(secondary),
    sets,
  };
}
const working = (n: number, extra: Record<string, unknown> = {}) =>
  Array.from({ length: n }, () => ({ set_type: 'normal', reps: 8, ...extra }));

describe('isHardSet', () => {
  it('excludes warm-ups and empty sets', () => {
    expect(isHardSet({ set_type: 'warmup', reps: 10 })).toBe(false);
    expect(isHardSet({ set_type: 'normal', reps: 0 })).toBe(false);
    expect(isHardSet({ set_type: 'normal', reps: 8 })).toBe(true);
  });

  it('uses RIR first, then RPE, and counts a set with neither', () => {
    expect(isHardSet({ reps: 8, rir: HARD_SET_MAX_RIR })).toBe(true);
    expect(isHardSet({ reps: 8, rir: HARD_SET_MAX_RIR + 1 })).toBe(false);
    expect(isHardSet({ reps: 8, rpe: 6 })).toBe(true);
    expect(isHardSet({ reps: 8, rpe: 5 })).toBe(false);
    // RIR wins over a contradicting RPE.
    expect(isHardSet({ reps: 8, rir: 1, rpe: 3 })).toBe(true);
  });
});

describe('hardSetsByMuscle', () => {
  it('weights primary 1 and secondary 0.5, counting a muscle once', () => {
    const result = hardSetsByMuscle([
      entry('2026-09-29', ['Chest'], working(4), ['Triceps', 'Chest']),
    ]);
    expect(result).toEqual({ Chest: 4, Triceps: 2 });
  });

  it('skips easy sets when effort is logged', () => {
    const sets = [...working(2, { rpe: 8 }), ...working(3, { rpe: 4 })];
    expect(hardSetsByMuscle([entry('2026-09-29', ['Back'], sets)])).toEqual({
      Back: 2,
    });
  });
});

describe('volumeStatus', () => {
  it('flags under only for a finished week', () => {
    expect(volumeStatus(WEEKLY_HARD_SETS_MIN - 1, true)).toBe('under');
    expect(volumeStatus(WEEKLY_HARD_SETS_MIN - 1, false)).toBe('building');
    expect(volumeStatus(WEEKLY_HARD_SETS_MIN, true)).toBe('inRange');
    expect(volumeStatus(WEEKLY_HARD_SETS_MAX, true)).toBe('inRange');
    expect(volumeStatus(WEEKLY_HARD_SETS_MAX + 0.5, false)).toBe('over');
  });
});

describe('buildMuscleVolume', () => {
  it('compares this and last week and keeps regularly trained muscles', () => {
    const { rows, thisWeekStart, lastWeekStart } = buildMuscleVolume(
      [
        entry('2026-09-29', ['Chest'], working(12)),
        entry('2026-09-22', ['Chest'], working(8)),
        entry('2026-09-22', ['Quadriceps'], working(14)),
        // Three weeks back: still "regular", so listed with zeros.
        entry('2026-09-10', ['Calves'], working(4)),
        // Older than the lookback: not listed.
        entry('2026-08-01', ['Neck'], working(4)),
        // After today: ignored.
        entry('2026-10-05', ['Chest'], working(30)),
      ],
      TODAY
    );
    expect(thisWeekStart).toBe('2026-09-28');
    expect(lastWeekStart).toBe('2026-09-21');
    const by = Object.fromEntries(rows.map((r) => [r.muscle, r]));
    expect(by.Chest).toMatchObject({
      thisWeek: 12,
      lastWeek: 8,
      thisWeekStatus: 'inRange',
      lastWeekStatus: 'under',
    });
    expect(by.Quadriceps).toMatchObject({
      thisWeek: 0,
      lastWeek: 14,
      thisWeekStatus: 'building',
      lastWeekStatus: 'inRange',
    });
    expect(by.Calves).toMatchObject({ lastWeekStatus: 'under' });
    expect(by.Neck).toBeUndefined();
    expect(rows[0]!.muscle).toBe('Chest');
  });

  it('respects the week-start preference', () => {
    const sundayFirst = buildMuscleVolume(
      [entry('2026-09-27', ['Chest'], working(3))],
      TODAY,
      0
    );
    // Sunday 09-27 starts the current week when weeks start on Sunday.
    expect(sundayFirst.thisWeekStart).toBe('2026-09-27');
    expect(sundayFirst.rows[0]).toMatchObject({ muscle: 'Chest', thisWeek: 3 });
    const mondayFirst = buildMuscleVolume(
      [entry('2026-09-27', ['Chest'], working(3))],
      TODAY,
      1
    );
    expect(mondayFirst.rows[0]).toMatchObject({ thisWeek: 0, lastWeek: 3 });
  });
});
