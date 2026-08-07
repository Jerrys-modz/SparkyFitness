import {
  buildWatchActiveWorkoutPayload,
  buildWatchPresetSummaries,
} from '../../src/utils/watchWorkoutSnapshot';
import type { ActiveWorkoutState, Rest } from '../../src/stores/activeWorkoutStore';
import type { ExerciseSessionResponse } from '@workspace/shared';
import type { WorkoutPreset } from '../../src/types/workoutPresets';

type PresetSession = Extract<ExerciseSessionResponse, { type: 'preset' }>;

const readyRest: Rest = {
  state: 'ready',
  durationSec: 0,
  endsAt: null,
  pausedRemainingMs: null,
  scheduledNotificationId: null,
  instanceToken: 0,
};

const makeSession = (): PresetSession => ({
  type: 'preset',
  id: 'session-1',
  entry_date: '2026-03-20',
  workout_preset_id: null,
  name: 'Push Day',
  description: null,
  notes: null,
  source: 'sparky',
  total_duration_minutes: 0,
  activity_details: [],
  exercises: [
    {
      id: 'entry-1',
      exercise_id: 'ex-1',
      duration_minutes: 0,
      calories_burned: 0,
      entry_date: '2026-03-20',
      notes: null,
      distance: null,
      avg_heart_rate: null,
      source: null,
      superset_group: null,
      exercise_snapshot: {
        id: 'ex-1',
        name: 'Bench Press',
        category: 'Strength',
        calories_per_hour: 400,
        source: 'system',
        images: [],
      },
      activity_details: [],
      sets: [
        {
          id: 101,
          set_number: 1,
          set_type: 'normal',
          reps: 10,
          weight: 60,
          duration: null,
          rest_time: 90,
          notes: null,
          rpe: null,
          completed_at: '2026-03-20T10:00:00.000Z',
        },
        {
          id: 102,
          set_number: 2,
          set_type: 'normal',
          reps: null,
          weight: null,
          duration: null,
          rest_time: 90,
          notes: null,
          rpe: null,
          completed_at: null,
        },
      ],
    },
    {
      id: 'entry-2',
      exercise_id: 'ex-2',
      duration_minutes: 0,
      calories_burned: 0,
      entry_date: '2026-03-20',
      notes: null,
      distance: null,
      avg_heart_rate: null,
      source: null,
      superset_group: null,
      exercise_snapshot: {
        id: 'ex-2',
        name: 'Squat',
        category: 'Strength',
        calories_per_hour: 500,
        source: 'system',
        images: [],
      },
      activity_details: [],
      sets: [
        {
          id: 201,
          set_number: 1,
          set_type: 'normal',
          reps: null,
          weight: null,
          duration: null,
          rest_time: 120,
          notes: null,
          rpe: null,
          completed_at: null,
        },
      ],
    },
  ],
} as unknown as PresetSession);

type Source = Pick<
  ActiveWorkoutState,
  | 'sessionId'
  | 'session'
  | 'activeSetId'
  | 'completedSetIds'
  | 'rest'
  | 'startedAt'
  | 'previousSessionSets'
  | 'plannedSetValues'
>;

const makeSource = (overrides: Partial<Source> = {}): Source => ({
  sessionId: 'session-1',
  session: makeSession(),
  activeSetId: '102',
  completedSetIds: { '101': 1_700_000_000_000 },
  rest: readyRest,
  startedAt: 1_700_000_000_000,
  previousSessionSets: {},
  plannedSetValues: {},
  ...overrides,
});

describe('buildWatchPresetSummaries', () => {
  it('trims presets down to id/name/exerciseCount', () => {
    const presets = [
      { id: 1, name: 'Push', exercises: [{}, {}] },
      { id: 2, name: 'Pull', exercises: [{}] },
    ] as unknown as WorkoutPreset[];

    expect(buildWatchPresetSummaries(presets)).toEqual([
      { id: 1, name: 'Push', exerciseCount: 2 },
      { id: 2, name: 'Pull', exerciseCount: 1 },
    ]);
  });

  it('returns an empty array for an empty preset list', () => {
    expect(buildWatchPresetSummaries([])).toEqual([]);
  });
});

describe('buildWatchActiveWorkoutPayload', () => {
  it('returns null when there is no live session', () => {
    expect(buildWatchActiveWorkoutPayload(makeSource({ sessionId: null }), 'kg')).toBeNull();
    expect(buildWatchActiveWorkoutPayload(makeSource({ session: null }), 'kg')).toBeNull();
  });

  it('describes the active set, its exercise, and the set-dot row in kg', () => {
    const payload = buildWatchActiveWorkoutPayload(makeSource(), 'kg');

    expect(payload).not.toBeNull();
    expect(payload).toMatchObject({
      sessionId: 'session-1',
      workoutName: 'Push Day',
      exerciseName: 'Bench Press',
      setNumber: 2,
      setCount: 2,
      activeSetId: '102',
      targetReps: 10,
      weightUnit: 'kg',
      isFinished: false,
    });
    expect(payload?.setDots).toEqual([
      { id: '101', completed: true, isActive: false },
      { id: '102', completed: false, isActive: true },
    ]);
  });

  it('converts the assumed target weight into the requested display unit', () => {
    // Set 102 has no explicit weight, so the assumed value falls back to the
    // preceding set-in-progress (rule 3 of resolveAssumedSetValues): 60kg.
    const kgPayload = buildWatchActiveWorkoutPayload(makeSource(), 'kg');
    const lbsPayload = buildWatchActiveWorkoutPayload(makeSource(), 'lbs');

    expect(kgPayload?.targetWeight).toBeCloseTo(60);
    expect(lbsPayload?.targetWeight).toBeCloseTo(132.28, 1);
  });

  it('falls back to the last exercise and marks isFinished once every set is done', () => {
    const payload = buildWatchActiveWorkoutPayload(
      makeSource({
        activeSetId: null,
        completedSetIds: { '101': 1, '102': 2, '201': 3 },
      }),
      'kg',
    );

    expect(payload).toMatchObject({
      exerciseName: 'Squat',
      activeSetId: null,
      isFinished: true,
    });
    expect(payload?.setDots).toEqual([{ id: '201', completed: true, isActive: false }]);
  });

  it('carries the rest state through unchanged', () => {
    const resting: Rest = {
      state: 'resting',
      durationSec: 90,
      endsAt: 1_700_000_090_000,
      pausedRemainingMs: null,
      scheduledNotificationId: 'notif-1',
      instanceToken: 1,
    };

    const payload = buildWatchActiveWorkoutPayload(makeSource({ rest: resting }), 'kg');

    expect(payload?.rest).toEqual({
      state: 'resting',
      durationSec: 90,
      endsAt: 1_700_000_090_000,
    });
  });
});
