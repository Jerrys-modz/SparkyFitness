import { apiCall } from '@/api/api';
import type {
  ImportWorkoutProgramRequest,
  ImportWorkoutProgramResponse,
  WorkoutProgramFile,
} from '@workspace/shared';

/** A preset the person can see, as a shareable workout program file. */
export const exportWorkoutPreset = (
  presetId: number | string
): Promise<WorkoutProgramFile> =>
  apiCall(
    `/v2/workout-programs/presets/${encodeURIComponent(String(presetId))}/export`
  );

/** A plan the person can see, with the presets it runs, as a program file. */
export const exportWorkoutPlan = (
  planId: number | string
): Promise<WorkoutProgramFile> =>
  apiCall(
    `/v2/workout-programs/plans/${encodeURIComponent(String(planId))}/export`
  );

/** Adds a program file to the person's own library, presets and plans. */
export const importWorkoutProgram = (
  body: ImportWorkoutProgramRequest
): Promise<ImportWorkoutProgramResponse> =>
  apiCall('/v2/workout-programs/import', { method: 'POST', body });
