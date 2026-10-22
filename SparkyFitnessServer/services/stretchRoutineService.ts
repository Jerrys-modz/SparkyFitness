import {
  getStretchRoutine,
  STRETCH_EXERCISE_SOURCE,
  type StretchMove,
} from '@workspace/shared';
import exerciseDb from '../models/exercise.js';
import workoutPresetService from './workoutPresetService.js';

async function findOrCreateStretchExercise(
  userId: string,
  move: StretchMove
): Promise<string> {
  const existing = await exerciseDb.getExerciseBySourceAndSourceId(
    STRETCH_EXERCISE_SOURCE,
    move.id,
    userId
  );
  if (existing) return existing.id;

  const created = await exerciseDb.createExercise({
    user_id: userId,
    source: STRETCH_EXERCISE_SOURCE,
    source_id: move.id,
    name: move.name,
    category: 'stretching',
    force: null,
    level: 'beginner',
    mechanic: null,
    equipment: ['body only'],
    primary_muscles: move.primaryMuscles,
    secondary_muscles: [],
    instructions: [move.instructions],
    images: [],
    calories_per_hour: null,
    description: null,
    is_custom: true,
    shared_with_public: false,
    modality: 'duration',
  });
  return created.id;
}

/**
 * Adds a starter stretching routine to the user's workout presets. Moves are
 * created once per user and reused; every call creates a new preset so the
 * user can edit their copy freely.
 */
async function addStarterRoutine(userId: string, routineId: string) {
  const routine = getStretchRoutine(routineId);
  if (!routine) return null;

  const exercises = [];
  for (const [index, move] of routine.moves.entries()) {
    const exerciseId = await findOrCreateStretchExercise(userId, move);
    const sides = move.perSide ? 2 : 1;
    exercises.push({
      exercise_id: exerciseId,
      sort_order: index,
      sets: Array.from({ length: sides }, (_, i) => ({
        set_number: i + 1,
        duration: move.holdSeconds,
        notes: move.perSide ? (i === 0 ? 'Left side' : 'Right side') : null,
      })),
    });
  }

  return workoutPresetService.createWorkoutPreset(userId, {
    name: routine.name,
    description: routine.description,
    is_public: false,
    workout_format: 'standard',
    exercises,
  });
}

export { addStarterRoutine };
export default { addStarterRoutine };
