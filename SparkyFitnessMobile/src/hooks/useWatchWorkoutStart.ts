import { useEffect } from 'react';
import WatchConnectivity from '../../modules/watch-connectivity';
import { queryClient } from './queryClient';
import { workoutPresetsQueryKey } from './queryKeys';
import { getWorkoutPresetById } from '../services/api/workoutPresetsApi';
import type { WorkoutPresetsResponse } from '../types/workoutPresets';
import {
  buildPresetLiveExerciseConfigs,
  buildPresetStartExercisesPayload,
} from '../utils/workoutSession';
import type { StartLiveWorkoutArgs } from './useStartLiveWorkout';

type StartFn = (args: StartLiveWorkoutArgs) => Promise<void>;

/**
 * Starts a saved workout when the watch asks. The phone builds the session
 * the same way its own preset list does, then arms the watch with the usual
 * `workoutStart`. A preset id the phone cannot load is ignored.
 */
export function useWatchWorkoutStart(enabled: boolean, start: StartFn): void {
  useEffect(() => {
    if (!enabled || !WatchConnectivity?.isSupported()) return;
    const watch = WatchConnectivity;
    let cancelled = false;

    const sub = watch.addListener('onWorkoutStartRequested', (payload) => {
      const presetId = Number(payload.presetId);
      if (!Number.isFinite(presetId)) return;
      void (async () => {
        const cached = queryClient.getQueryData<WorkoutPresetsResponse>(
          workoutPresetsQueryKey
        );
        let preset = cached?.presets.find((item) => item.id === presetId);
        if (preset == null) {
          try {
            preset = await getWorkoutPresetById(presetId);
          } catch {
            return;
          }
        }
        if (cancelled || preset.exercises.length === 0) return;
        await start({
          name: preset.name,
          exercises: buildPresetStartExercisesPayload(preset),
          exerciseConfigs: buildPresetLiveExerciseConfigs(preset),
          sourcePresetId: preset.id,
          workoutFormat: preset.workout_format ?? 'standard',
          timeCapSeconds: preset.time_cap_seconds ?? null,
        });
      })();
    });

    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [enabled, start]);
}
