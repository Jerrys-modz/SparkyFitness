import type {
  ExerciseEntryResponse,
  ExerciseEntrySetResponse,
  PresetSessionResponse,
} from '@workspace/shared';

/**
 * A fixed workout used to photograph the phone's workout detail screen in CI.
 *
 * The phone counterpart of the watch target's `ScreenshotSeed`, and it exists
 * for the same reason: there is otherwise no way to see this screen without a
 * running server, an account and a logged workout, none of which a CI runner
 * has. `WorkoutDetailScreen` takes its session from route params and falls
 * back to kg when preferences are unavailable, so handing it a fixture is
 * enough — nothing else on that screen needs the network.
 *
 * Driven by a build-time env var rather than a launch argument: Expo inlines
 * `EXPO_PUBLIC_*` into the JS bundle, so no native plumbing is needed to get a
 * flag from `xcodebuild` into React Native. That also means the check below is
 * a constant after bundling, not a runtime lookup.
 *
 * Deliberately NOT gated on `__DEV__`: the screenshot build bundles its JS
 * with `FORCE_BUNDLING=1` so the app runs in a simulator without Metro, and
 * whether that counts as a dev bundle is an implementation detail of the
 * build. The env var alone decides, and it is absent from every normal build.
 */
export const SCREENSHOT_SEED_ENABLED =
  process.env.EXPO_PUBLIC_SCREENSHOT_SEED === '1';

const set = (
  id: number,
  setNumber: number,
  reps: number,
  weight: number,
  completedAt: string
): ExerciseEntrySetResponse => ({
  id,
  set_number: setNumber,
  set_type: 'normal',
  reps,
  weight,
  duration: null,
  rest_time: 90,
  notes: null,
  rpe: null,
  completed_at: completedAt,
  is_pr: false,
});

const exercise = (
  id: string,
  name: string,
  avgHeartRate: number,
  maxHeartRate: number,
  caloriesBurned: number,
  sets: ExerciseEntrySetResponse[]
): ExerciseEntryResponse => ({
  id,
  exercise_id: `library-${id}`,
  duration_minutes: 12,
  calories_burned: caloriesBurned,
  entry_date: '2026-09-19',
  notes: null,
  distance: null,
  avg_heart_rate: avgHeartRate,
  max_heart_rate: maxHeartRate,
  source: 'sparky',
  superset_group: null,
  exercise_snapshot: {
    id: `library-${id}`,
    name,
    category: 'Strength',
    images: [],
    primary_muscles: null,
    secondary_muscles: null,
    equipment: null,
    instructions: null,
    force: null,
    level: null,
    mechanic: null,
    calories_per_hour: null,
  },
  activity_details: [],
  sets,
});

/**
 * Two exercises with deliberately different heart rates and calories: the
 * per-exercise split is the whole point of tagging watch batches by exercise,
 * and one figure repeated twice would not show it. The averages (132 and 154)
 * mean the summary reads 143, and the maxima (161 and 178) make the session
 * max 178 — both visibly derived rather than copied from a single entry.
 */
export const SCREENSHOT_SESSION: PresetSessionResponse = {
  type: 'preset',
  id: 'screenshot-session',
  entry_date: '2026-09-19',
  workout_preset_id: null,
  name: 'Push Day',
  description: null,
  notes: null,
  source: 'sparky',
  total_duration_minutes: 48,
  exercises: [
    exercise('entry-bench', 'Bench Press', 132, 161, 148, [
      set(1, 1, 10, 60, '2026-09-19T09:02:00.000Z'),
      set(2, 2, 8, 70, '2026-09-19T09:05:00.000Z'),
      set(3, 3, 6, 80, '2026-09-19T09:08:00.000Z'),
    ]),
    exercise('entry-ohp', 'Overhead Press', 154, 178, 96, [
      set(4, 1, 10, 35, '2026-09-19T09:14:00.000Z'),
      set(5, 2, 9, 40, '2026-09-19T09:17:00.000Z'),
    ]),
  ],
  activity_details: [],
};
