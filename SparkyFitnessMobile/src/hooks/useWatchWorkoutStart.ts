import { useCallback, useEffect, useRef } from 'react';
import WatchConnectivity, {
  type WatchWorkoutStartRequestedPayload,
} from '../../modules/watch-connectivity';
import { queryClient } from './queryClient';
import { workoutPresetsQueryKey } from './queryKeys';
import { getWorkoutPresetById } from '../services/api/workoutPresetsApi';
import { getActiveServerConfigId } from '../services/storage';
import { useActiveWorkoutStore } from '../stores/activeWorkoutStore';
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
 *
 * The listener stays up while the server is offline. A tap that arrives
 * then is kept and run once the connection is back, instead of being
 * dropped because nothing was listening. A second delivery while that
 * preset's session is already live is ignored, so a queued copy or the
 * watch's retry does not open the "workout in progress" prompt.
 */
export function useWatchWorkoutStart(
  enabled: boolean,
  connected: boolean,
  start: StartFn
): void {
  const startRef = useRef(start);
  startRef.current = start;
  const connectedRef = useRef(connected);
  connectedRef.current = connected;
  const pendingRef = useRef<WatchWorkoutStartRequestedPayload | null>(null);
  const aliveRef = useRef(true);

  const run = useCallback(async (payload: WatchWorkoutStartRequestedPayload) => {
    const presetId = Number(payload.presetId);
    const serverId = payload.serverId;
    // A queued tap from before this field, or from another account, must
    // not start whatever preset now happens to have that id.
    if (!Number.isFinite(presetId) || !serverId) return;
    const activeServerId = await getActiveServerConfigId();
    if (!aliveRef.current || activeServerId !== serverId) return;
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
    const live = useActiveWorkoutStore.getState();
    if (
      !aliveRef.current ||
      preset.exercises.length === 0 ||
      (await getActiveServerConfigId()) !== serverId ||
      (live.sessionId != null && live.sourcePresetId === preset.id)
    ) {
      return;
    }
    await startRef.current({
      name: preset.name,
      exercises: buildPresetStartExercisesPayload(preset),
      exerciseConfigs: buildPresetLiveExerciseConfigs(preset),
      sourcePresetId: preset.id,
      workoutFormat: preset.workout_format ?? 'standard',
      timeCapSeconds: preset.time_cap_seconds ?? null,
    });
  }, []);

  useEffect(() => {
    if (!enabled || !WatchConnectivity?.isSupported()) return;
    const watch = WatchConnectivity;
    aliveRef.current = true;
    const sub = watch.addListener('onWorkoutStartRequested', (payload) => {
      if (!connectedRef.current) {
        pendingRef.current = payload;
        return;
      }
      void run(payload);
    });
    return () => {
      aliveRef.current = false;
      sub.remove();
    };
  }, [enabled, run]);

  useEffect(() => {
    if (!enabled || !connected) return;
    const pending = pendingRef.current;
    if (pending == null) return;
    pendingRef.current = null;
    void run(pending);
  }, [enabled, connected, run]);
}
