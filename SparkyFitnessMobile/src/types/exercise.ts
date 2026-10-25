import type {
  ExerciseLoadConvention,
  ExerciseModality,
} from '@workspace/shared';

export interface Exercise {
  id: string;
  name: string;
  category: string | null;
  /** Absent/null on pre-modality servers; resolve via `resolveSnapshotModality`. */
  modality?: ExerciseModality | null;
  /** How logged weight and reps count toward volume; absent on older servers, which means `total`. */
  load_convention?: ExerciseLoadConvention;
  equipment: string[];
  primary_muscles: string[];
  secondary_muscles: string[];
  calories_per_hour: number;
  source: string;
  images: string[];
  tags: string[];
  force?: string | null;
  level?: string | null;
  mechanic?: string | null;
  instructions?: string[];
  description?: string | null;
  userId?: string | null;
  isCustom?: boolean;
  sharedWithPublic?: boolean;
}

export interface SuggestedExercisesResponse {
  recentExercises: Exercise[];
  topExercises: Exercise[];
}
