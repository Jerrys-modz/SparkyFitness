import {
  requestAuthorization,
  saveWorkoutSample,
  WorkoutActivityType,
} from '@kingstinct/react-native-healthkit';
import { addLog } from './LogService';
import { WATCH_SESSION_METADATA_KEY } from './healthkit/dataTransformation';

export interface PhoneWorkoutToSave {
  sessionId: string;
  startedAt: number;
  finishedAt: number;
}

// A workout this short is a mis-tap, and HealthKit rejects a zero-length one.
const MIN_WORKOUT_MS = 60_000;

export async function requestPhoneWorkoutHealthAccess(): Promise<boolean> {
  try {
    await requestAuthorization({
      toShare: ['HKWorkoutTypeIdentifier'],
      toRead: [],
    });
    return true;
  } catch (error) {
    addLog(`Apple Health workout access request failed: ${error}`, 'ERROR');
    return false;
  }
}

/**
 * Files a phone-only strength session in Apple Health. Stamped with the same
 * `SparkyFitnessSessionId` key the watch uses, so the inbound sync drops it
 * rather than importing it back as a second diary entry.
 */
export async function savePhoneWorkoutToHealth(
  workout: PhoneWorkoutToSave
): Promise<boolean> {
  if (workout.finishedAt - workout.startedAt < MIN_WORKOUT_MS) return false;
  try {
    await saveWorkoutSample(
      WorkoutActivityType.traditionalStrengthTraining,
      [],
      new Date(workout.startedAt),
      new Date(workout.finishedAt),
      undefined,
      { [WATCH_SESSION_METADATA_KEY]: workout.sessionId }
    );
    return true;
  } catch (error) {
    addLog(`Saving the workout to Apple Health failed: ${error}`, 'ERROR');
    return false;
  }
}
