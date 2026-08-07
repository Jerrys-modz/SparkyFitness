import { useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';

import { usePreferences, useServerConnection, useWorkoutPresets } from '../hooks';
import { useCreateWorkout } from '../hooks/useExerciseMutations';
import { flushActiveWorkoutBeforeClear } from '../hooks/useActiveWorkoutAutosave';
import { useActiveWorkoutStore, type ActiveSetPatch } from '../stores/activeWorkoutStore';
import {
  buildPresetStartExercisesPayload,
  extractPlannedSetValues,
  stripPlannedSetValues,
} from '../utils/workoutSession';
import { buildWatchActiveWorkoutPayload, buildWatchPresetSummaries } from '../utils/watchWorkoutSnapshot';
import { weightToKg } from '../utils/unitConversions';
import { getTodayDate } from '../utils/dateUtils';
import { getActiveServerConfig } from '../services/storage';
import { WatchConnectivity } from '../services/watchConnectivity';
import { resyncWatchContext, setWatchActiveWorkout, setWatchPresets, setWatchServerConnected } from '../services/watchContext';
import { ensureNotificationPermission, maybePromptForExactAlarmPermission } from '../services/notifications';
import { addLog } from '../services/LogService';
import { navigationRef } from './ActiveWorkoutBar';
import type { WatchCommand } from '../types/watchBridge';
import type { WorkoutPreset } from '../types/workoutPresets';

/**
 * Headless, root-mounted bridge between `activeWorkoutStore` and the watchOS
 * companion app. Mirrors the same live-workout state `ActiveWorkoutBar` and
 * the workout Live Activity already read, and — like the Live Activity's
 * button intents — turns watch button presses back into the same store
 * actions the phone UI uses, so the watch never grows its own copy of the
 * workout business logic.
 *
 * iOS-only: mount with `Platform.OS === 'ios' &&` so `useWorkoutPresets`
 * doesn't fetch on Android, where there's no watch to mirror to.
 */
const WatchWorkoutBridge: React.FC = () => {
  const queryClient = useQueryClient();
  const { presets } = useWorkoutPresets();
  const { isConnected } = useServerConnection();
  const { preferences } = usePreferences();
  const { createSession, invalidateCache } = useCreateWorkout();

  const weightUnit: 'kg' | 'lbs' = preferences?.default_weight_unit === 'kg' ? 'kg' : 'lbs';

  const sessionId = useActiveWorkoutStore((s) => s.sessionId);
  const session = useActiveWorkoutStore((s) => s.session);
  const activeSetId = useActiveWorkoutStore((s) => s.activeSetId);
  const completedSetIds = useActiveWorkoutStore((s) => s.completedSetIds);
  const rest = useActiveWorkoutStore((s) => s.rest);
  const startedAt = useActiveWorkoutStore((s) => s.startedAt);
  const previousSessionSets = useActiveWorkoutStore((s) => s.previousSessionSets);
  const plannedSetValues = useActiveWorkoutStore((s) => s.plannedSetValues);

  // Read from the command handler without forcing it to resubscribe on every
  // presets refetch or mutateAsync identity change. Written from an effect,
  // not during render — refs are for effects/handlers, not render.
  const presetsRef = useRef<WorkoutPreset[]>(presets);
  const createSessionRef = useRef(createSession);
  const invalidateCacheRef = useRef(invalidateCache);
  useEffect(() => {
    presetsRef.current = presets;
    createSessionRef.current = createSession;
    invalidateCacheRef.current = invalidateCache;
  }, [presets, createSession, invalidateCache]);

  useEffect(() => {
    WatchConnectivity.activate();
  }, []);

  useEffect(() => {
    setWatchPresets(buildWatchPresetSummaries(presets));
  }, [presets]);

  useEffect(() => {
    setWatchServerConnected(isConnected);
  }, [isConnected]);

  useEffect(() => {
    setWatchActiveWorkout(
      buildWatchActiveWorkoutPayload(
        { sessionId, session, activeSetId, completedSetIds, rest, startedAt, previousSessionSets, plannedSetValues },
        weightUnit,
      ),
    );
  }, [sessionId, session, activeSetId, completedSetIds, rest, startedAt, previousSessionSets, plannedSetValues, weightUnit]);

  // Create a session server-side from a watch-picked preset and seed the
  // store, mirroring `useStartLiveWorkout`'s runStart minus the navigation
  // requirement — the watch has no navigator of its own to drive.
  const handleStartPreset = useCallback(async (presetId: number) => {
    if (useActiveWorkoutStore.getState().sessionId != null) {
      // A workout is already live (started from the phone or a prior watch
      // tap); the watch is already mirroring it, just make sure it has the
      // latest state instead of silently dropping the tap.
      resyncWatchContext();
      return;
    }
    const preset = presetsRef.current.find((p) => p.id === presetId);
    if (!preset) {
      addLog(`[WatchWorkoutBridge] Watch requested unknown preset ${presetId}`, 'WARNING');
      return;
    }

    const entryDate = getTodayDate();
    try {
      const sourceServerConfigId = (await getActiveServerConfig())?.id;
      const exercises = buildPresetStartExercisesPayload(preset);
      const plannedValues = extractPlannedSetValues(exercises);
      const session = await createSessionRef.current({
        name: preset.name,
        entry_date: entryDate,
        source: 'sparky',
        exercises: stripPlannedSetValues(exercises),
      });
      invalidateCacheRef.current(entryDate);
      void ensureNotificationPermission().then(() => maybePromptForExactAlarmPermission());
      useActiveWorkoutStore.getState().startWorkout(session, {
        createdByLiveStart: true,
        plannedSetValues: plannedValues,
        sourcePresetId: preset.id,
        sourceServerConfigId,
      });
      if (navigationRef.isReady()) {
        navigationRef.navigate('ActiveWorkout');
      }
    } catch (error) {
      addLog(`[WatchWorkoutBridge] Failed to start preset ${presetId} from watch: ${error}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: 'Could not start workout from Watch',
        text2: 'Please try again.',
      });
    }
  }, []);

  const handleLogSet = useCallback((command: Extract<WatchCommand, { type: 'logSet' }>) => {
    const patch: ActiveSetPatch = {};
    if (command.reps != null) patch.reps = command.reps;
    if (command.weight != null) patch.weight = weightToKg(command.weight, command.weightUnit);
    if (Object.keys(patch).length > 0) {
      useActiveWorkoutStore.getState().updateSetField(command.setId, patch);
    }
    useActiveWorkoutStore.getState().completeSet(command.setId);
  }, []);

  const handleFinishWorkout = useCallback(async () => {
    await flushActiveWorkoutBeforeClear(queryClient);
    useActiveWorkoutStore.getState().clearWorkout();
  }, [queryClient]);

  useEffect(() => {
    const unsubscribe = WatchConnectivity.addCommandListener((command) => {
      switch (command.type) {
        case 'startPreset':
          void handleStartPreset(command.presetId);
          break;
        case 'logSet':
          handleLogSet(command);
          break;
        case 'skipRest':
          useActiveWorkoutStore.getState().dismissRest();
          break;
        case 'adjustRest':
          useActiveWorkoutStore.getState().adjustRest(command.deltaSec);
          break;
        case 'finishWorkout':
          void handleFinishWorkout();
          break;
        case 'requestSync':
          resyncWatchContext();
          break;
      }
    });
    return unsubscribe;
  }, [handleStartPreset, handleLogSet, handleFinishWorkout]);

  return null;
};

export default WatchWorkoutBridge;
