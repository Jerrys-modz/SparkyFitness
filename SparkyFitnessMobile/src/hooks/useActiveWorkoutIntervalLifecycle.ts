import { useEffect, useState } from 'react';
import type { WorkoutFormat } from '@workspace/shared';
import {
  startIntervalAudioSession,
  stopIntervalAudioSession,
} from '../services/sounds';

/**
 * Manages interval audio session lifecycle (enabling audio mid-workout in silent mode)
 * and provides a synchronized 1-second ticker for workout elapsed clock and interval HUDs.
 */
export function useActiveWorkoutIntervalLifecycle(
  workoutFormat?: WorkoutFormat | null
): { now: number } {
  // Interval audio session management: keep background/silent-mode audio active
  // for countdown beeps and phase cues during interval workouts.
  useEffect(() => {
    if (workoutFormat && workoutFormat !== 'standard') {
      void startIntervalAudioSession();
    }
    return () => {
      if (workoutFormat && workoutFormat !== 'standard') {
        void stopIntervalAudioSession();
      }
    };
  }, [workoutFormat]);

  // One 1s tick drives the elapsed clock and re-renders the rest countdown.
  // Set rows are memoized, so ticks only re-render the header and rest bar.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  return { now };
}
