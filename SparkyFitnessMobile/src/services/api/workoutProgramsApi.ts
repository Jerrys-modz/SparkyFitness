import type {
  ImportWorkoutProgramRequest,
  ImportWorkoutProgramResponse,
  WorkoutProgramFile,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Workout Programs API';

/** A preset the person can see, as a shareable workout program file. */
export const exportWorkoutPreset = (
  presetId: number | string
): Promise<WorkoutProgramFile> =>
  apiFetch<WorkoutProgramFile>({
    endpoint: `/api/v2/workout-programs/presets/${encodeURIComponent(String(presetId))}/export`,
    serviceName: SERVICE,
    operation: 'export workout preset',
  });

/** A plan the person can see, with the presets it runs, as a program file. */
export const exportWorkoutPlan = (
  planId: number | string
): Promise<WorkoutProgramFile> =>
  apiFetch<WorkoutProgramFile>({
    endpoint: `/api/v2/workout-programs/plans/${encodeURIComponent(String(planId))}/export`,
    serviceName: SERVICE,
    operation: 'export workout plan',
  });

/** Adds a program file to the person's own library, presets and plans. */
export const importWorkoutProgram = (
  body: ImportWorkoutProgramRequest
): Promise<ImportWorkoutProgramResponse> =>
  apiFetch<ImportWorkoutProgramResponse>({
    endpoint: '/api/v2/workout-programs/import',
    serviceName: SERVICE,
    operation: 'import workout program',
    method: 'POST',
    body,
  });
