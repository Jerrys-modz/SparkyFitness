import type { QueryClient } from '@tanstack/react-query';
import {
  exerciseHistoryQueryKey,
  exerciseHistoryResetQueryKey,
  exerciseStatsQueryKeyRoot,
  suggestedExercisesQueryKey,
  dailySummaryQueryKey,
  workoutSessionQueryKeyRoot,
  workoutLocationsQueryKey,
  trainingCalendarRootQueryKey,
  trainingLoadRootQueryKey,
  fitnessFatigueRootQueryKey,
  routesQueryKey,
  segmentsQueryKey,
  heatmapRootQueryKey,
} from './queryKeys';

export function invalidateExerciseCache(
  queryClient: QueryClient,
  entryDate: string
) {
  void queryClient.invalidateQueries({
    queryKey: [...workoutLocationsQueryKey],
  });
  // A saved run may follow a route: its run count, best time and history.
  void queryClient.invalidateQueries({ queryKey: [...routesQueryKey] });
  // ...and over segments (best times, counts) and the personal heatmap.
  void queryClient.invalidateQueries({ queryKey: [...segmentsQueryKey] });
  void queryClient.invalidateQueries({ queryKey: [...heatmapRootQueryKey] });
  void queryClient.invalidateQueries({
    queryKey: [...exerciseHistoryQueryKey],
  });
  queryClient.removeQueries({
    queryKey: [...exerciseHistoryQueryKey],
    type: 'inactive',
  });
  queryClient.setQueryData(exerciseHistoryResetQueryKey, Date.now());
  void queryClient.invalidateQueries({
    queryKey: [...suggestedExercisesQueryKey],
  });
  void queryClient.invalidateQueries({
    queryKey: [...exerciseStatsQueryKeyRoot],
  });
  void queryClient.invalidateQueries({
    queryKey: dailySummaryQueryKey(entryDate),
  });
  // Every cached single-session read, by prefix. Watch telemetry lands on an
  // entry AFTER the workout is saved, so a screen already showing that session
  // — the completion summary most of all, which opens the moment a workout
  // ends — holds a copy with no heart rate in it. Without this the figures
  // appear only on a later visit, which reads as them not working at all.
  void queryClient.invalidateQueries({
    queryKey: [...workoutSessionQueryKeyRoot],
  });
  void queryClient.invalidateQueries({
    queryKey: ['activeWorkoutPlan'],
  });
  void queryClient.invalidateQueries({
    queryKey: ['workoutPlanTemplates'],
  });
  // Load, readiness and the plan calendar are all worked out from the diary's
  // workouts, so a saved, edited or deleted workout changes every one of them.
  for (const queryKey of [
    trainingLoadRootQueryKey,
    fitnessFatigueRootQueryKey,
    trainingCalendarRootQueryKey,
  ]) {
    void queryClient.invalidateQueries({ queryKey: [...queryKey] });
  }
}
