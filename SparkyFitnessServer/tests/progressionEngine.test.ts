import { describe, it, expect } from 'vitest';
import {
  applyProgressionToSets,
  evaluateProgression,
  isWarmupSetType,
  lastPerformanceFromRecentSession,
  progressionConfigFromPresetExercise,
  type ExerciseProgressionConfig,
  type LastExercisePerformance,
} from '@workspace/shared';

describe('Progression Engine', () => {
  const standardWeightConfig: ExerciseProgressionConfig = {
    targetSets: 3,
    repGoal: 24,
    incrementType: 'weight',
    incrementValue: 5,
    equipmentBrand: 'Hammer Strength',
  };

  const standardRepConfig: ExerciseProgressionConfig = {
    targetSets: 3,
    repGoal: 24,
    incrementType: 'reps',
    incrementValue: 3,
  };

  it('handles first session with no prior history', () => {
    const result = evaluateProgression(standardWeightConfig, null);
    expect(result.status).toBe('FIRST_SESSION');
    expect(result.suggestedWeight).toBe(0);
    expect(result.suggestedRepGoal).toBe(24);
  });

  it('triggers WEIGHT increase when total rep goal is hit or exceeded', () => {
    const lastSession: LastExercisePerformance = {
      baseWeight: 200,
      sets: [
        { setNumber: 1, reps: 9, weight: 200 },
        { setNumber: 2, reps: 8, weight: 200 },
        { setNumber: 3, reps: 8, weight: 200 },
      ],
    };

    const result = evaluateProgression(standardWeightConfig, lastSession);

    expect(result.goalAchieved).toBe(true);
    expect(result.status).toBe('PROGRESSION_WEIGHT_INCREASE');
    expect(result.suggestedWeight).toBe(205);
    expect(result.totalRepsAchieved).toBe(25);
    expect(result.repDifference).toBe(1);
  });

  it('triggers REPS increase when increment type is reps', () => {
    const lastSession: LastExercisePerformance = {
      baseWeight: 50,
      sets: [
        { setNumber: 1, reps: 8, weight: 50 },
        { setNumber: 2, reps: 8, weight: 50 },
        { setNumber: 3, reps: 8, weight: 50 },
      ],
    };

    const result = evaluateProgression(standardRepConfig, lastSession);

    expect(result.goalAchieved).toBe(true);
    expect(result.status).toBe('PROGRESSION_REPS_INCREASE');
    expect(result.suggestedWeight).toBe(50);
    expect(result.suggestedRepGoal).toBe(27);
  });

  it('maintains weight and rep target when the total goal is missed', () => {
    const lastSession: LastExercisePerformance = {
      baseWeight: 200,
      sets: [
        { setNumber: 1, reps: 8, weight: 200 },
        { setNumber: 2, reps: 7, weight: 200 },
        { setNumber: 3, reps: 6, weight: 200 },
      ],
    };

    const result = evaluateProgression(standardWeightConfig, lastSession);

    expect(result.goalAchieved).toBe(false);
    expect(result.status).toBe('MAINTAIN_TARGET');
    expect(result.suggestedWeight).toBe(200);
    expect(result.suggestedRepGoal).toBe(24);
    expect(result.repDifference).toBe(-3);
  });

  it('handles custom decimal increments', () => {
    const decimalConfig: ExerciseProgressionConfig = {
      targetSets: 3,
      repGoal: 45,
      incrementType: 'weight',
      incrementValue: 7.5,
    };

    const lastSession: LastExercisePerformance = {
      baseWeight: 145,
      sets: [
        { setNumber: 1, reps: 15, weight: 145 },
        { setNumber: 2, reps: 15, weight: 145 },
        { setNumber: 3, reps: 15, weight: 145 },
      ],
    };

    const result = evaluateProgression(decimalConfig, lastSession);

    expect(result.goalAchieved).toBe(true);
    expect(result.suggestedWeight).toBe(152.5);
  });

  it('ignores warmup rows when summing total reps', () => {
    const lastSession: LastExercisePerformance = {
      baseWeight: 200,
      sets: [
        { setNumber: 1, reps: 12, weight: 60, setType: 'Warm-up' },
        { setNumber: 2, reps: 8, weight: 200 },
        { setNumber: 3, reps: 8, weight: 200 },
        { setNumber: 4, reps: 8, weight: 200 },
      ],
    };

    const result = evaluateProgression(standardWeightConfig, lastSession);
    expect(result.totalRepsAchieved).toBe(24);
    expect(result.goalAchieved).toBe(true);
  });

  it('requires every working set to hit the per-set target in fixed mode', () => {
    const fixedConfig: ExerciseProgressionConfig = {
      progressionMode: 'fixed',
      targetSets: 5,
      repGoal: 20,
      incrementType: 'weight',
      incrementValue: 2.5,
    };
    const lastSession: LastExercisePerformance = {
      baseWeight: 80,
      sets: [
        { setNumber: 1, reps: 20, weight: 80 },
        { setNumber: 2, reps: 20, weight: 80 },
        { setNumber: 3, reps: 20, weight: 80 },
        { setNumber: 4, reps: 20, weight: 80 },
        { setNumber: 5, reps: 19, weight: 80 },
      ],
    };

    const result = evaluateProgression(fixedConfig, lastSession);
    expect(result.goalAchieved).toBe(false);
    expect(result.status).toBe('MAINTAIN_TARGET');
    expect(result.message).toContain('4/5 sets reached 20 reps');
    expect(result.suggestedWeight).toBe(80);
  });

  it('increments weight in fixed mode when every set hits the target', () => {
    const fixedConfig: ExerciseProgressionConfig = {
      progressionMode: 'fixed',
      targetSets: 3,
      repGoal: 8,
      incrementType: 'weight',
      incrementValue: 2.5,
    };
    const lastSession: LastExercisePerformance = {
      baseWeight: 100,
      sets: [
        { setNumber: 1, reps: 8, weight: 100 },
        { setNumber: 2, reps: 9, weight: 100 },
        { setNumber: 3, reps: 8, weight: 100 },
      ],
    };

    const result = evaluateProgression(fixedConfig, lastSession);
    expect(result.goalAchieved).toBe(true);
    expect(result.status).toBe('PROGRESSION_WEIGHT_INCREASE');
    expect(result.suggestedWeight).toBe(102.5);
    expect(result.suggestedRepGoal).toBe(8);
  });

  it('increments the per-set target in step-load mode and holds weight', () => {
    const stepConfig: ExerciseProgressionConfig = {
      progressionMode: 'step_load',
      targetSets: 3,
      repGoal: 8,
      incrementType: 'reps',
      incrementValue: 1,
    };
    const lastSession: LastExercisePerformance = {
      baseWeight: 40,
      sets: [
        { setNumber: 1, reps: 8, weight: 40 },
        { setNumber: 2, reps: 8, weight: 40 },
        { setNumber: 3, reps: 8, weight: 40 },
      ],
    };

    const result = evaluateProgression(stepConfig, lastSession);
    expect(result.goalAchieved).toBe(true);
    expect(result.status).toBe('PROGRESSION_REPS_INCREASE');
    expect(result.suggestedWeight).toBe(40);
    expect(result.suggestedRepGoal).toBe(9);
  });

  it('does not auto-progress in manual mode', () => {
    const result = evaluateProgression(
      {
        progressionMode: 'manual',
        targetSets: 3,
        incrementType: 'weight',
        incrementValue: 5,
      },
      {
        baseWeight: 90,
        sets: [
          { setNumber: 1, reps: 12, weight: 90 },
          { setNumber: 2, reps: 12, weight: 90 },
          { setNumber: 3, reps: 12, weight: 90 },
        ],
      }
    );
    expect(result.status).toBe('MANUAL');
    expect(result.goalAchieved).toBe(false);
    expect(result.suggestedWeight).toBe(90);
  });

  it('applyProgressionToSets only rewrites working sets on a hit', () => {
    const sets = [
      { set_type: 'Warm-up', reps: 10, weight: 40 },
      { set_type: 'Working Set', reps: 8, weight: 100 },
      { set_type: 'Working Set', reps: 8, weight: 100 },
      { set_type: 'Working Set', reps: 8, weight: 100 },
    ];
    const evaluation = evaluateProgression(standardWeightConfig, {
      baseWeight: 100,
      sets: [
        { setNumber: 1, reps: 8, weight: 100 },
        { setNumber: 2, reps: 8, weight: 100 },
        { setNumber: 3, reps: 8, weight: 100 },
      ],
    });
    const next = applyProgressionToSets(sets, standardWeightConfig, evaluation);
    expect(next[0]).toEqual({ set_type: 'Warm-up', reps: 10, weight: 40 });
    expect(next.slice(1).map((s) => s.weight)).toEqual([105, 105, 105]);
  });

  it('isWarmupSetType accepts web and mobile labels', () => {
    expect(isWarmupSetType('Warm-up')).toBe(true);
    expect(isWarmupSetType('warmup')).toBe(true);
    expect(isWarmupSetType('Working Set')).toBe(false);
    expect(isWarmupSetType('normal')).toBe(false);
  });

  it('progressionConfigFromPresetExercise uses working-set count and kg defaults', () => {
    const config = progressionConfigFromPresetExercise({
      progression_mode: 'fixed',
      rep_goal: 8,
      increment_type: 'weight',
      increment_value: '2.50',
      sets: [
        { set_type: 'Warm-up' },
        { set_type: 'Working Set' },
        { set_type: 'Working Set' },
        { set_type: 'Working Set' },
      ],
    });
    expect(config.progressionMode).toBe('fixed');
    expect(config.targetSets).toBe(3);
    expect(config.repGoal).toBe(8);
    expect(config.incrementType).toBe('weight');
    expect(config.incrementValue).toBe(2.5);
  });

  it('lastPerformanceFromRecentSession ignores missing sessions and uses working weight', () => {
    expect(lastPerformanceFromRecentSession(null)).toBeNull();
    const last = lastPerformanceFromRecentSession({
      entryDate: '2026-09-01',
      sets: [
        { setNumber: 1, setType: 'warmup', weight: 40, reps: 10 },
        { setNumber: 2, setType: 'Working Set', weight: 100, reps: 8 },
        { setNumber: 3, setType: 'Working Set', weight: 100, reps: 8 },
      ],
    });
    expect(last?.baseWeight).toBe(100);
    expect(last?.sets).toHaveLength(3);
    expect(last?.sets[0]?.setType).toBe('warmup');
  });
});
