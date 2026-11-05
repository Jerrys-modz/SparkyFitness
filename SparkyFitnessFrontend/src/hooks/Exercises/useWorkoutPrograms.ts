import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type {
  ImportWorkoutProgramRequest,
  WorkoutProgramFile,
} from '@workspace/shared';
import {
  exportWorkoutPlan,
  exportWorkoutPreset,
  importWorkoutProgram,
} from '@/api/Exercises/workoutPrograms';
import { useExerciseInvalidation } from '@/hooks/useInvalidateKeys';

function fileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${slug || 'workout'}.sparkyfitness.json`;
}

function downloadProgram(file: WorkoutProgramFile, name: string): void {
  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName(name);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

interface ExportVariables {
  kind: 'preset' | 'plan';
  id: number | string;
  name: string;
}

/**
 * Downloads a preset or plan as a workout program file to send to someone.
 * A failure is already toasted by `apiCall`.
 */
export const useExportWorkoutProgramMutation = () => {
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async ({ kind, id, name }: ExportVariables) => {
      const file =
        kind === 'preset'
          ? await exportWorkoutPreset(id)
          : await exportWorkoutPlan(id);
      downloadProgram(file, name);
    },
    meta: {
      successMessage: t(
        'workoutPrograms.export.success',
        'Saved as a file. Send it to anyone with SparkyFitness to add it to their workouts.'
      ),
    },
  });
};

/**
 * Imports a program file. The library, presets and plans all change, so the
 * whole exercise family is refreshed.
 */
export const useImportWorkoutProgramMutation = () => {
  const { t } = useTranslation();
  const invalidate = useExerciseInvalidation();
  return useMutation({
    mutationFn: (body: ImportWorkoutProgramRequest) =>
      importWorkoutProgram(body),
    onSuccess: invalidate,
    meta: {
      successMessage: t(
        'workoutPrograms.import.success',
        'Workouts added. Find them under your presets and plans.'
      ),
    },
  });
};
