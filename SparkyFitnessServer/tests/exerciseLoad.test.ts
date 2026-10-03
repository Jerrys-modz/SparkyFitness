import { describe, expect, it } from 'vitest';
import {
  bodyWeightOnDay,
  deriveExerciseModality,
  effectiveLoadKg,
  epleyOneRepMaxKg,
  resolveExerciseModality,
  setVolumeKg,
} from '@workspace/shared';

describe('effectiveLoadKg', () => {
  it('is the set weight for an ordinary exercise', () => {
    expect(effectiveLoadKg(60, 'weight_reps', 80)).toBe(60);
    expect(effectiveLoadKg(null, 'weight_reps', 80)).toBe(0);
  });

  it('adds body weight for a bodyweight exercise, assisted or weighted', () => {
    expect(effectiveLoadKg(20, 'bodyweight_reps', 80)).toBe(100);
    expect(effectiveLoadKg(-30, 'bodyweight_reps', 80)).toBe(50);
    expect(effectiveLoadKg(null, 'bodyweight_reps', 80)).toBe(80);
  });

  it('never goes below zero, and counts only the added weight with no body weight', () => {
    expect(effectiveLoadKg(-100, 'bodyweight_reps', 80)).toBe(0);
    expect(effectiveLoadKg(20, 'bodyweight_reps', null)).toBe(20);
    expect(effectiveLoadKg(-20, 'bodyweight_reps', null)).toBe(0);
  });

  it('feeds volume and the Epley estimate', () => {
    expect(setVolumeKg({ weight: 10, reps: 5 }, 'bodyweight_reps', 70)).toBe(
      400
    );
    expect(epleyOneRepMaxKg(100, 30)).toBe(200);
    expect(epleyOneRepMaxKg(0, 5)).toBe(0);
    expect(epleyOneRepMaxKg(100, 0)).toBe(0);
  });
});

describe('bodyWeightOnDay', () => {
  const readings = [
    { date: '2026-09-10', weightKg: 81 },
    { date: '2026-09-01', weightKg: 80 },
    { date: '2026-09-20', weightKg: 0 },
  ];

  it('takes the latest reading on or before the day', () => {
    expect(bodyWeightOnDay(readings, '2026-09-10')).toBe(81);
    expect(bodyWeightOnDay(readings, '2026-09-15')).toBe(81);
    expect(bodyWeightOnDay(readings, '2026-09-05')).toBe(80);
  });

  it('falls back to the earliest later reading, ignoring empty ones', () => {
    expect(bodyWeightOnDay(readings, '2026-08-01')).toBe(80);
    expect(bodyWeightOnDay([], '2026-09-01')).toBeNull();
  });
});

describe('bodyweight modality derivation', () => {
  it('derives bodyweight from equipment that is bodyweight only', () => {
    expect(deriveExerciseModality('strength', ['body only'])).toBe(
      'bodyweight_reps'
    );
    expect(deriveExerciseModality('strength', ['Pull-up bar'])).toBe(
      'bodyweight_reps'
    );
    expect(deriveExerciseModality('strength', 'dip station')).toBe(
      'bodyweight_reps'
    );
  });

  it('leaves blank or loaded equipment, cardio and holds alone', () => {
    expect(deriveExerciseModality('strength', [])).toBe('weight_reps');
    expect(deriveExerciseModality('strength', null)).toBe('weight_reps');
    expect(deriveExerciseModality('strength', ['body only', 'barbell'])).toBe(
      'weight_reps'
    );
    expect(
      deriveExerciseModality('strength', [
        'body only',
        'custom weighted attachment',
      ])
    ).toBe('weight_reps');
    expect(deriveExerciseModality('strength', ['body only', 'bench'])).toBe(
      'bodyweight_reps'
    );
    expect(
      deriveExerciseModality('strength', ['Pull-up bar', 'incline bench'])
    ).toBe('bodyweight_reps');
    expect(deriveExerciseModality('cardio', ['body only'])).toBe(
      'duration_distance'
    );
    expect(deriveExerciseModality('isometric', ['body only'])).toBe('duration');
    // Callers that pass no equipment keep the category-only rule.
    expect(deriveExerciseModality('strength')).toBe('weight_reps');
  });

  it('keeps an explicit modality over the derived one', () => {
    expect(
      resolveExerciseModality('weight_reps', 'strength', ['body only'])
    ).toBe('weight_reps');
    expect(resolveExerciseModality('bodyweight_reps', 'strength')).toBe(
      'bodyweight_reps'
    );
  });
});
