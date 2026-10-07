import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import exerciseService from '../services/exerciseService.js';
import {
  createExerciseEntriesFromTemplate,
  deleteExerciseEntriesByTemplateId,
  WORKOUT_PLAN_ENTRY_SOURCE,
} from '../models/exerciseTemplate.js';

/**
 * A workout logged from a plan session carries the plan's
 * workout_plan_assignment_id, exactly like the rows a prefill plan generates.
 * Editing, toggling or deleting the plan must only remove the generated rows,
 * which are told apart by their source (#2677).
 */

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(),
}));
vi.mock('../config/logging.js', () => ({ log: vi.fn() }));
vi.mock('../models/exercise.js', () => ({
  getExerciseById: vi.fn(async () => ({ calories_per_hour: 300 })),
}));
vi.mock('../services/exerciseService.js', () => ({
  default: {
    createExerciseEntry: vi.fn(),
    logWorkoutPresetGrouped: vi.fn(),
  },
}));

const USER_ID = 'user-uuid-1234';
const TEMPLATE_ID = 42;
const TODAY = '2026-10-07';

type QueryCall = [string, unknown[]?];

const mockClient = (results: Array<Record<string, unknown>> = []) => {
  const query = vi.fn(async () => results.shift() ?? { rows: [], rowCount: 0 });
  const client = { query, release: vi.fn() };
  vi.mocked(getClient).mockResolvedValue(client as never);
  return client;
};

const normalize = (sql: string) => sql.replace(/\s+/g, ' ').trim();

describe('deleteExerciseEntriesByTemplateId', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('only deletes preset sessions the plan generated, not sessions the user logged from it', async () => {
    const client = mockClient();

    await deleteExerciseEntriesByTemplateId(TEMPLATE_ID, USER_ID, TODAY);

    const [presetSql, presetParams] = client.query.mock
      .calls[0] as unknown as QueryCall;
    expect(normalize(presetSql)).toMatch(
      /^DELETE FROM exercise_preset_entries WHERE user_id = \$1 AND source = \$4 AND id IN/
    );
    expect(presetParams).toEqual([
      USER_ID,
      TEMPLATE_ID,
      TODAY,
      WORKOUT_PLAN_ENTRY_SOURCE,
    ]);
  });

  it('only deletes standalone entries the plan generated, never children of a logged session', async () => {
    const client = mockClient();

    await deleteExerciseEntriesByTemplateId(TEMPLATE_ID, USER_ID, TODAY);

    const [entrySql, entryParams] = client.query.mock
      .calls[1] as unknown as QueryCall;
    const sql = normalize(entrySql);
    expect(sql).toMatch(/^DELETE FROM exercise_entries WHERE user_id = \$1/);
    expect(sql).toContain('AND exercise_preset_entry_id IS NULL');
    // Generated rows, plus pre-existing generated rows dated after today that
    // still carry the default 'Manual' source. Today's 'Manual' rows stay.
    expect(sql).toContain(
      "AND (source = $4 OR (source = 'Manual' AND entry_date > $3))"
    );
    expect(entryParams).toEqual([
      USER_ID,
      TEMPLATE_ID,
      TODAY,
      WORKOUT_PLAN_ENTRY_SOURCE,
    ]);
  });

  it('returns the number of deleted rows and releases the client', async () => {
    const client = mockClient([{ rowCount: 2 }, { rowCount: 1 }]);

    const deleted = await deleteExerciseEntriesByTemplateId(
      TEMPLATE_ID,
      USER_ID,
      TODAY
    );

    expect(deleted).toBe(3);
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe('createExerciseEntriesFromTemplate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('stamps generated preset sessions and standalone entries with the plan source', async () => {
    // 2026-10-07 is a Wednesday (day_of_week 3); a one-day plan keeps the
    // loop to a single date.
    mockClient([
      {
        rows: [
          {
            id: TEMPLATE_ID,
            user_id: USER_ID,
            start_date: TODAY,
            end_date: TODAY,
            is_active: true,
            assignments: [
              {
                id: 7,
                day_of_week: 3,
                workout_preset_id: null,
                exercise_id: 'exercise-1',
              },
              {
                id: 8,
                day_of_week: 3,
                workout_preset_id: 11,
                exercise_id: null,
              },
            ],
          },
        ],
      },
      { rows: [] },
    ]);

    await createExerciseEntriesFromTemplate(TEMPLATE_ID, USER_ID, TODAY);

    expect(exerciseService.createExerciseEntry).toHaveBeenCalledTimes(1);
    expect(exerciseService.createExerciseEntry).toHaveBeenCalledWith(
      USER_ID,
      USER_ID,
      expect.objectContaining({
        exercise_id: 'exercise-1',
        entry_date: TODAY,
        workout_plan_assignment_id: 7,
      }),
      // skipDuplicateCheck: the assignment+date lookup would otherwise merge
      // the generated row into a workout the user logged from the plan today.
      { entrySource: WORKOUT_PLAN_ENTRY_SOURCE, skipDuplicateCheck: true }
    );
    expect(exerciseService.logWorkoutPresetGrouped).toHaveBeenCalledWith(
      USER_ID,
      USER_ID,
      11,
      TODAY,
      {
        source: WORKOUT_PLAN_ENTRY_SOURCE,
        workoutPlanAssignmentId: 8,
      }
    );
  });
});
