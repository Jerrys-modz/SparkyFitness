import { describe, expect, it } from 'vitest';
import {
  splitFitsVenue,
  WORKOUT_SPLITS,
  workoutSplitExerciseIds,
  type WorkoutSplitVenue,
} from '@workspace/shared';
import snapshot from './fixtures/freeExerciseDbSplitExercises.json' with { type: 'json' };

// The fixture is the free-exercise-db entry (id and equipment) of every
// exercise a split uses, taken from
// https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json.
// Adding an exercise to a split means adding it here from that file, which is
// what proves the id exists upstream.
const exercises: Record<string, { equipment: string | null }> = snapshot;

const EQUIPMENT_BY_VENUE: Record<WorkoutSplitVenue, string[]> = {
  home: ['dumbbell', 'body only', 'none'],
  garage: ['dumbbell', 'body only', 'none', 'barbell'],
  gym: [
    'dumbbell',
    'body only',
    'none',
    'barbell',
    'machine',
    'cable',
    'e-z curl bar',
  ],
};

describe('workout split catalog', () => {
  it('has unique split ids and unique session ids within each split', () => {
    const ids = WORKOUT_SPLITS.map((split) => split.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const split of WORKOUT_SPLITS) {
      const sessionIds = split.sessions.map((session) => session.id);
      expect(new Set(sessionIds).size).toBe(sessionIds.length);
    }
  });

  it.each(WORKOUT_SPLITS.map((split) => [split.id, split] as const))(
    '%s uses only known exercises that fit its venue',
    (_id, split) => {
      for (const exerciseId of workoutSplitExerciseIds(split)) {
        const known = exercises[exerciseId];
        expect(known, `${exerciseId} is not in the snapshot`).toBeDefined();
        const equipment = (known.equipment ?? 'none').toLowerCase();
        expect(
          EQUIPMENT_BY_VENUE[split.venue],
          `${exerciseId} needs ${equipment}`
        ).toContain(equipment);
      }
    }
  );

  it('gives every exercise sets and either reps or a duration', () => {
    for (const split of WORKOUT_SPLITS) {
      for (const session of split.sessions) {
        for (const exercise of session.exercises) {
          expect(exercise.sets).toBeGreaterThan(0);
          const counted = exercise.durationSeconds ?? exercise.reps;
          expect(counted).toBeGreaterThan(0);
          if (exercise.repGoal !== undefined) {
            expect(exercise.repGoal).toBeGreaterThan(exercise.reps);
          }
        }
      }
    }
  });

  it('lets a bigger venue do a smaller one', () => {
    const home = WORKOUT_SPLITS.find((split) => split.venue === 'home');
    const gym = WORKOUT_SPLITS.find((split) => split.venue === 'gym');
    expect(home && splitFitsVenue(home, 'gym')).toBe(true);
    expect(gym && splitFitsVenue(gym, 'home')).toBe(false);
  });
});
