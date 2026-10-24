import { describe, expect, it } from 'vitest';
import {
  DELOAD_LOAD_PERCENT,
  DELOAD_SETS_PERCENT,
  suggestDeload,
  type DeloadEntry,
  type RecoveryReading,
} from '@workspace/shared';

// Friday 2026-10-02; Monday weeks start 09-28, 09-21, 09-14, 09-07.
const TODAY = '2026-10-02';
const WEEKS = ['2026-09-07', '2026-09-14', '2026-09-21', '2026-09-28'];

function lift(
  name: string,
  weekStart: string,
  sets: { weight: number; reps: number; rpe?: number }[],
  muscles = ['Chest']
): DeloadEntry {
  return {
    entry_date: weekStart,
    exercise_id: name,
    exercise_name: name,
    exercise_modality: 'weight_reps',
    exercise_primary_muscles: JSON.stringify(muscles),
    sets: sets.map((s) => ({ set_type: 'normal', ...s })),
  };
}
const threeSets = (weight: number, reps = 5, rpe?: number) =>
  Array.from({ length: 3 }, () => ({ weight, reps, rpe }));

const base = { today: TODAY, firstDayOfWeek: 1 };

describe('suggestDeload', () => {
  it('has too little data', () => {
    const result = suggestDeload({
      ...base,
      entries: [lift('Squat', WEEKS[3]!, threeSets(100))],
    });
    expect(result.status).toBe('notEnoughData');
    expect(result.plan).toBeNull();
  });

  it('stays quiet while lifts keep progressing', () => {
    const entries = WEEKS.flatMap((w, i) => [
      lift('Squat', w, threeSets(100 + i * 5)),
      lift('Bench', w, threeSets(60 + i * 2.5)),
    ]);
    const result = suggestDeload({ ...base, entries });
    expect(result.status).toBe('ok');
    expect(result.reasons).toEqual([]);
  });

  it('suggests a lighter week when main lifts drop', () => {
    const loads = [100, 105, 105, 90];
    const entries = WEEKS.map((w, i) => lift('Squat', w, threeSets(loads[i]!)));
    const result = suggestDeload({ ...base, entries });
    expect(result.status).toBe('suggest');
    expect(result.reasons[0]).toMatchObject({
      code: 'e1rm_dropping',
      items: ['Squat'],
    });
    expect(result.plan).toMatchObject({
      weekStart: '2026-10-05',
      setsPercent: DELOAD_SETS_PERCENT,
      loadPercent: DELOAD_LOAD_PERCENT,
    });
    // Last full week: 3 sets of Chest-primary squat entries -> 3 hard sets.
    expect(result.plan!.muscleTargets[0]).toMatchObject({
      muscle: 'Chest',
      from: 1.5,
      to: 2,
    });
  });

  it('needs more than a single stalled lift', () => {
    const entries = WEEKS.map((w) => lift('Squat', w, threeSets(100)));
    const result = suggestDeload({ ...base, entries });
    expect(result.reasons.map((r) => r.code)).toEqual(['e1rm_stalled']);
    expect(result.status).toBe('ok');
  });

  it('adds up stalled lifts and rising RPE at the same load', () => {
    const rpes = [7, 7, 8, 9];
    const entries = WEEKS.flatMap((w, i) => [
      lift('Squat', w, threeSets(100, 5, rpes[i])),
      lift('Bench', w, threeSets(80, 5, rpes[i])),
    ]);
    const result = suggestDeload({ ...base, entries });
    expect(result.status).toBe('suggest');
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toContain('rpe_rising');
    expect(result.reasons.find((r) => r.code === 'rpe_rising')).toMatchObject({
      value: 20,
    });
  });

  it('does not call a heavier load at the same RPE rising', () => {
    const entries = WEEKS.map((w, i) =>
      lift('Squat', w, threeSets(100 + i * 5, 5, 8))
    );
    const result = suggestDeload({ ...base, entries });
    expect(result.reasons.map((r) => r.code)).not.toContain('rpe_rising');
  });

  it('counts sustained volume above the range plus a recovery drop', () => {
    const heavy = (w: string) =>
      lift(
        'Press',
        w,
        Array.from({ length: 22 }, () => ({ weight: 50, reps: 8 })),
        ['Chest', 'Shoulders']
      );
    const entries = [
      lift('Squat', WEEKS[0]!, threeSets(100)),
      heavy(WEEKS[1]!),
      heavy(WEEKS[2]!),
      heavy(WEEKS[3]!),
    ];
    const result = suggestDeload({ ...base, entries });
    expect(result.reasons.map((r) => r.code)).toContain('high_volume');
  });

  it('uses a readiness and HRV drop against the prior baseline', () => {
    const entries = WEEKS.map((w, i) =>
      lift('Squat', w, threeSets(100 + i * 5))
    );
    const recovery: RecoveryReading[] = [];
    for (let d = 0; d < 35; d += 1) {
      const day = new Date(Date.UTC(2026, 9, 2 - d)).toISOString().slice(0, 10);
      const recent = d < 7;
      recovery.push({
        day,
        readinessScore: recent ? 50 : 80,
        overnightHrv: recent ? 40 : 60 + (d % 2) * 4,
      });
    }
    const result = suggestDeload({ ...base, entries, recovery });
    expect(result.status).toBe('suggest');
    expect(result.reasons.map((r) => r.code).sort()).toEqual([
      'hrv_low',
      'readiness_low',
    ]);
  });

  it('is quiet right after a light week', () => {
    const entries = [
      lift('Squat', '2026-08-31', threeSets(100)),
      lift('Squat', '2026-09-07', threeSets(100)),
      lift('Squat', '2026-09-14', threeSets(100)),
      // The light week: one set instead of three.
      lift('Squat', '2026-09-21', threeSets(90).slice(0, 1)),
      lift('Squat', '2026-09-28', threeSets(90)),
    ];
    const result = suggestDeload({ ...base, entries });
    expect(result.status).toBe('recentlyDeloaded');
    expect(result.plan).toBeNull();
  });
});
