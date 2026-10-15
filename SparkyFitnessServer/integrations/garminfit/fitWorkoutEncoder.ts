import { Encoder, Profile, Utils } from '@garmin/fitsdk';
import type { IntervalPlan, IntervalStep } from '@workspace/shared';

export type FitWorkoutSport = 'running' | 'walking';

const INTENSITY: Record<IntervalStep['kind'], string> = {
  warmup: 'warmup',
  work: 'active',
  recovery: 'recovery',
  cooldown: 'cooldown',
};

/** A heart-rate target is stored in FIT as bpm + 100; below 100 means a zone. */
const HEART_RATE_OFFSET = 100;

function stepMessage(
  step: IntervalStep,
  index: number,
  labels: string[]
): { mesgNum: number } & Record<string, unknown> {
  const message: { mesgNum: number } & Record<string, unknown> = {
    mesgNum: Profile.MesgNum.WORKOUT_STEP,
    messageIndex: index,
    wktStepName: labels[index],
    intensity: INTENSITY[step.kind],
  };
  if (typeof step.meters === 'number' && step.meters > 0) {
    // Distance durations are in centimetres.
    message.durationType = 'distance';
    message.durationValue = Math.round(step.meters * 100);
  } else {
    // Time durations are in milliseconds.
    message.durationType = 'time';
    message.durationValue = Math.round(step.seconds * 1000);
  }
  if (step.pace) {
    // Speed targets are in mm/s; the fastest pace is the highest speed.
    message.targetType = 'speed';
    message.targetValue = 0;
    message.customTargetValueLow = Math.round(
      1_000_000 / step.pace.maxSecondsPerKm
    );
    message.customTargetValueHigh = Math.round(
      1_000_000 / step.pace.minSecondsPerKm
    );
  } else if (step.heartRate) {
    message.targetType = 'heartRate';
    message.targetValue = 0;
    message.customTargetValueLow = step.heartRate.minBpm + HEART_RATE_OFFSET;
    message.customTargetValueHigh = step.heartRate.maxBpm + HEART_RATE_OFFSET;
  } else {
    message.targetType = 'open';
    message.targetValue = 0;
  }
  return message;
}

/** Names each step the way a watch shows it: "Run 400 m", "Walk 2:00". */
function stepLabels(plan: IntervalPlan, sport: FitWorkoutSport): string[] {
  const active = sport === 'walking' ? 'Walk' : 'Run';
  return plan.steps.map((step) => {
    const how =
      typeof step.meters === 'number' && step.meters > 0
        ? step.unit === 'mi'
          ? `${(step.meters / 1609.344).toFixed(2)} mi`
          : `${Math.round(step.meters)} m`
        : `${Math.floor(step.seconds / 60)}:${String(Math.round(step.seconds % 60)).padStart(2, '0')}`;
    const name =
      step.kind === 'warmup'
        ? 'Warm up'
        : step.kind === 'cooldown'
          ? 'Cool down'
          : step.kind === 'work'
            ? plan.style === 'fastEasy'
              ? 'Fast'
              : active
            : plan.style === 'fastEasy'
              ? 'Easy'
              : 'Walk';
    return `${name} ${how}`.slice(0, 15);
  });
}

/**
 * Encodes an interval plan as a FIT workout file, which a Garmin watch loads
 * from `GARMIN/NewFiles` (or Garmin Connect imports) as a structured workout.
 */
export function encodeFitWorkout(
  plan: IntervalPlan,
  options: { name: string; sport: FitWorkoutSport; now?: Date }
): Uint8Array {
  const encoder = new Encoder();
  const labels = stepLabels(plan, options.sport);
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 'workout',
    manufacturer: 'development',
    product: 0,
    timeCreated: Utils.convertDateToDateTime(options.now ?? new Date()),
    serialNumber: 1,
  });
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.WORKOUT,
    sport: options.sport,
    numValidSteps: plan.steps.length,
    wktName: options.name.slice(0, 15),
  });
  plan.steps.forEach((step, index) => {
    encoder.writeMesg(stepMessage(step, index, labels));
  });
  return encoder.close();
}

export interface StrengthWorkoutSet {
  reps?: number | null;
  /** Kilograms. */
  weight?: number | null;
  /** Seconds, for a timed hold with no rep count. */
  duration?: number | null;
  /** Seconds of rest after the set. */
  rest_time?: number | null;
}

export interface StrengthWorkoutExercise {
  exercise_name: string;
  sets: StrengthWorkoutSet[];
}

type FitMessage = { mesgNum: number } & Record<string, unknown>;

/**
 * Encodes a strength preset as a FIT workout: one step per set (reps or a timed
 * hold, with its planned weight) and a rest step after each set that has one.
 * A watch's strength app steps through them and records the sets.
 */
export function encodeFitStrengthWorkout(
  workout: { name: string; exercises: StrengthWorkoutExercise[] },
  options: { now?: Date } = {}
): Uint8Array {
  const steps: FitMessage[] = [];
  for (const exercise of workout.exercises) {
    for (const set of exercise.sets) {
      const step: FitMessage = {
        mesgNum: Profile.MesgNum.WORKOUT_STEP,
        messageIndex: steps.length,
        wktStepName: exercise.exercise_name.slice(0, 15),
        intensity: 'active',
        targetType: 'open',
        targetValue: 0,
      };
      if (set.reps && set.reps > 0) {
        step.durationType = 'reps';
        step.durationValue = Math.round(set.reps);
      } else if (set.duration && set.duration > 0) {
        step.durationType = 'time';
        step.durationValue = Math.round(set.duration * 1000);
      } else {
        step.durationType = 'open';
        step.durationValue = 0;
      }
      if (set.weight && set.weight > 0) {
        // Kilograms; the SDK applies the field's x100 scale, which caps it at 655.35.
        step.exerciseWeight = Math.min(set.weight, 655.35);
      }
      steps.push(step);
      if (set.rest_time && set.rest_time > 0) {
        steps.push({
          mesgNum: Profile.MesgNum.WORKOUT_STEP,
          messageIndex: steps.length,
          wktStepName: 'Rest',
          intensity: 'rest',
          durationType: 'time',
          durationValue: Math.round(set.rest_time * 1000),
          targetType: 'open',
          targetValue: 0,
        });
      }
    }
  }

  const encoder = new Encoder();
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.FILE_ID,
    type: 'workout',
    manufacturer: 'development',
    product: 0,
    timeCreated: Utils.convertDateToDateTime(options.now ?? new Date()),
    serialNumber: 1,
  });
  encoder.writeMesg({
    mesgNum: Profile.MesgNum.WORKOUT,
    sport: 'training',
    subSport: 'strengthTraining',
    numValidSteps: steps.length,
    wktName: workout.name.slice(0, 15),
  });
  for (const step of steps) encoder.writeMesg(step);
  return encoder.close();
}
