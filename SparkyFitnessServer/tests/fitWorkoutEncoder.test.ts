import { describe, expect, it } from 'vitest';
import { buildIntervalPlan } from '@workspace/shared';
import { encodeFitWorkout } from '../integrations/garminfit/fitWorkoutEncoder.js';
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
