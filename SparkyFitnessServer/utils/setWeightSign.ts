import { isBodyweightModality, isExerciseModality } from '@workspace/shared';
import { ValidationError } from './errors.js';

/**
 * A negative set weight is added/assisting load on a bodyweight exercise.
 * Any other modality, or an unknown one, must not persist it.
 */
export function assertSetWeightSign(
  sets: readonly { weight?: number | null }[] | null | undefined,
  modality: string | null | undefined
): void {
  if (isExerciseModality(modality) && isBodyweightModality(modality)) return;
  for (const set of sets ?? []) {
    if (typeof set.weight === 'number' && set.weight < 0) {
      throw new ValidationError(
        'Negative weight is only valid on a bodyweight exercise.'
      );
    }
  }
}
