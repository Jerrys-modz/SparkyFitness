import { describe, expect, it } from 'vitest';
import { buildIntervalPlan } from '@workspace/shared';
import {
  encodeFitStrengthWorkout,
  encodeFitWorkout,
} from '../integrations/garminfit/fitWorkoutEncoder.js';
import { decodeFitBuffer } from '../integrations/garminfit/fitDecoder.js';

const decode = (bytes: Uint8Array) => decodeFitBuffer(Buffer.from(bytes));

describe('encodeFitWorkout', () => {
  it('round-trips a timed plan as workout steps', () => {
    const plan = buildIntervalPlan({
      style: 'fastEasy',
      warmupSeconds: 300,
      workSeconds: 60,
      recoverySeconds: 90,
      rounds: 2,
      cooldownSeconds: 300,
    });
    const result = decode(
      encodeFitWorkout(plan, { name: 'Speed', sport: 'running' })
    );
    expect(result.errors).toEqual([]);
    expect(result.integrityOk).toBe(true);
    const messages = result.messages as unknown as Record<string, any[]>;
    expect(messages.fileIdMesgs[0].type).toBe('workout');
    expect(messages.workoutMesgs[0]).toMatchObject({
      sport: 'running',
      numValidSteps: plan.steps.length,
      wktName: 'Speed',
    });
    const steps = messages.workoutStepMesgs;
    expect(steps).toHaveLength(plan.steps.length);
    expect(steps[0]).toMatchObject({
      intensity: 'warmup',
      durationType: 'time',
      durationValue: 300_000,
    });
    expect(steps[1]).toMatchObject({
      intensity: 'active',
      durationValue: 60_000,
    });
    expect(steps[2]).toMatchObject({ intensity: 'recovery' });
  });

  it('encodes distance steps and pace and heart-rate targets', () => {
    const plan = {
      style: 'fastEasy' as const,
      steps: [
        {
          kind: 'work' as const,
          seconds: 100,
          meters: 400,
          pace: { minSecondsPerKm: 240, maxSecondsPerKm: 300 },
        },
        {
          kind: 'recovery' as const,
          seconds: 120,
          heartRate: { minBpm: 100, maxBpm: 130 },
        },
      ],
    };
    const result = decode(
      encodeFitWorkout(plan, { name: 'Track', sport: 'walking' })
    );
    const steps = (result.messages as unknown as Record<string, any[]>)
      .workoutStepMesgs;
    expect(steps[0]).toMatchObject({
      durationType: 'distance',
      durationValue: 40_000,
      targetType: 'speed',
    });
    // Speed in mm/s; 240 s/km is the faster edge: 1000 m / 240 s ≈ 4.167 m/s.
    expect(steps[0].customTargetValueHigh).toBe(4167);
    expect(steps[0].customTargetValueLow).toBe(3333);
    expect(steps[1]).toMatchObject({
      targetType: 'heartRate',
      customTargetValueLow: 200,
      customTargetValueHigh: 230,
    });
  });
});

describe('encodeFitStrengthWorkout', () => {
  it('writes a step per set with reps, weight and rest', () => {
    const result = decode(
      encodeFitStrengthWorkout({
        name: 'Push day',
        exercises: [
          {
            exercise_name: 'Bench Press',
            sets: [
              { reps: 8, weight: 60, rest_time: 90 },
              { reps: 6, weight: 62.5, rest_time: 0 },
            ],
          },
          { exercise_name: 'Plank', sets: [{ duration: 45 }] },
        ],
      })
    );
    expect(result.errors).toEqual([]);
    const messages = result.messages as unknown as Record<string, any[]>;
    expect(messages.workoutMesgs[0]).toMatchObject({
      sport: 'training',
      subSport: 'strengthTraining',
      numValidSteps: 4,
    });
    const steps = messages.workoutStepMesgs;
    expect(steps[0]).toMatchObject({
      wktStepName: 'Bench Press',
      durationType: 'reps',
      durationValue: 8,
      exerciseWeight: 60,
    });
    expect(steps[1]).toMatchObject({
      intensity: 'rest',
      durationType: 'time',
      durationValue: 90_000,
    });
    expect(steps[2]).toMatchObject({ durationValue: 6, exerciseWeight: 62.5 });
    expect(steps[3]).toMatchObject({
      wktStepName: 'Plank',
      durationType: 'time',
      durationValue: 45_000,
    });
  });
});
