import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getSystemClient, endPool } from '../db/poolManager.js';
import { initializeDatabase } from '../utils/initializeDatabase.js';
import { deleteExerciseEntriesByTemplateId } from '../models/exerciseTemplate.js';

async function dbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (
    !process.env.SPARKY_FITNESS_APP_DB_USER ||
    !process.env.SPARKY_FITNESS_DB_HOST
  ) {
    return false;
  }
  const probe = new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_APP_DB_USER,
    password: process.env.SPARKY_FITNESS_APP_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    try {
      await probe.end();
    } catch {
      // ignore close errors
    }
  }
}

// Editing or deleting a plan clears the entries it prefilled from today on.
// A workout the user actually did carries the same assignment id, so it must
// survive that cleanup.
describe('workout plan template cleanup keeps logged workouts', () => {
  let canRun = false;
  let adminClient: pg.PoolClient | null = null;
  const testEmail = `plan-cleanup-${Date.now()}@example.test`;
  let userId: string;
  let exerciseId: string;
  let templateId: number;
  let assignmentId: number;
  const pastDate = '2026-09-10';
  const today = '2026-09-12';
  const futureDate = '2026-09-15';

  async function insertSession(
    source: string,
    entryDate: string,
    completed: boolean
  ): Promise<number> {
    const sessionRes = await adminClient!.query(
      `INSERT INTO exercise_preset_entries (user_id, name, entry_date, source, created_at, updated_at)
       VALUES ($1, 'Day 2 Upper', $2, $3, NOW(), NOW())
       RETURNING id`,
      [userId, entryDate, source]
    );
    const sessionId = sessionRes.rows[0].id;
    const entryRes = await adminClient!.query(
      `INSERT INTO exercise_entries (user_id, exercise_id, exercise_name, entry_date, duration_minutes, calories_burned, workout_plan_assignment_id, exercise_preset_entry_id, created_at, updated_at)
       VALUES ($1, $2, 'Plan Cleanup Row', $3, 30, 150, $4, $5, NOW(), NOW())
       RETURNING id`,
      [userId, exerciseId, entryDate, assignmentId, sessionId]
    );
    await adminClient!.query(
      `INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, reps, weight, completed_at)
       VALUES ($1, 1, 10, 50, $2)`,
      [entryRes.rows[0].id, completed ? new Date() : null]
    );
    return sessionId;
  }

  async function insertIndividual(
    entryDate: string,
    completed: boolean
  ): Promise<string> {
    const entryRes = await adminClient!.query(
      `INSERT INTO exercise_entries (user_id, exercise_id, exercise_name, entry_date, duration_minutes, calories_burned, workout_plan_assignment_id, created_at, updated_at)
       VALUES ($1, $2, 'Plan Cleanup Row', $3, 30, 150, $4, NOW(), NOW())
       RETURNING id`,
      [userId, exerciseId, entryDate, assignmentId]
    );
    await adminClient!.query(
      `INSERT INTO exercise_entry_sets (exercise_entry_id, set_number, reps, weight, completed_at)
       VALUES ($1, 1, 10, 50, $2)`,
      [entryRes.rows[0].id, completed ? new Date() : null]
    );
    return entryRes.rows[0].id;
  }

  async function sessionExists(id: number): Promise<boolean> {
    const res = await adminClient!.query(
      'SELECT 1 FROM exercise_preset_entries WHERE id = $1',
      [id]
    );
    return res.rows.length === 1;
  }

  async function sessionChildCount(id: number): Promise<number> {
    const res = await adminClient!.query(
      'SELECT COUNT(*) FROM exercise_entries WHERE exercise_preset_entry_id = $1',
      [id]
    );
    return parseInt(res.rows[0].count, 10);
  }

  async function entryExists(id: string): Promise<boolean> {
    const res = await adminClient!.query(
      'SELECT 1 FROM exercise_entries WHERE id = $1',
      [id]
    );
    return res.rows.length === 1;
  }

  beforeAll(async () => {
    canRun = await dbReachable();
    if (!canRun) return;

    await initializeDatabase();

    adminClient = await getSystemClient();
    if (!adminClient) {
      canRun = false;
      return;
    }

    const userRes = await adminClient.query(
      `INSERT INTO "user" (id, email, name, email_verified, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, 'Plan Cleanup User', true, NOW(), NOW())
       RETURNING id`,
      [testEmail]
    );
    userId = userRes.rows[0].id;

    const exRes = await adminClient.query(
      `INSERT INTO exercises (name, category, user_id, is_custom, source, created_at, updated_at)
       VALUES ('Plan Cleanup Row', 'Strength', $1, true, 'custom', NOW(), NOW())
       RETURNING id`,
      [userId]
    );
    exerciseId = exRes.rows[0].id;

    const templateRes = await adminClient.query(
      `INSERT INTO workout_plan_templates (user_id, plan_name, is_active, created_at, updated_at)
       VALUES ($1, 'Cleanup Plan', true, NOW(), NOW())
       RETURNING id`,
      [userId]
    );
    templateId = templateRes.rows[0].id;

    const assignmentRes = await adminClient.query(
      `INSERT INTO workout_plan_template_assignments (template_id, day_of_week, exercise_id, sort_order)
       VALUES ($1, 0, $2, 0)
       RETURNING id`,
      [templateId, exerciseId]
    );
    assignmentId = assignmentRes.rows[0].id;
  });

  afterAll(async () => {
    if (adminClient && userId) {
      await adminClient.query('DELETE FROM "user" WHERE id = $1', [userId]);
      adminClient.release();
    }
    await endPool();
  });

  it('removes untouched prefilled entries and keeps anything worked out', async (ctx) => {
    if (!canRun) {
      ctx.skip();
      return;
    }

    const prefilledToday = await insertSession('Workout Plan', today, false);
    const prefilledFuture = await insertSession(
      'Workout Plan',
      futureDate,
      false
    );
    const prefilledRunLive = await insertSession('Workout Plan', today, true);
    const startedFromCard = await insertSession('sparky', today, true);
    const startedNothingLogged = await insertSession('sparky', today, false);
    const pastPrefilled = await insertSession('Workout Plan', pastDate, false);
    const individualFuture = await insertIndividual(futureDate, false);
    const individualLogged = await insertIndividual(today, true);

    await deleteExerciseEntriesByTemplateId(templateId, userId, today);

    // Placeholders the plan generated and nobody touched go.
    expect(await sessionExists(prefilledToday)).toBe(false);
    expect(await sessionExists(prefilledFuture)).toBe(false);
    expect(await entryExists(individualFuture)).toBe(false);

    // Workouts the user did stay, with all their exercises.
    expect(await sessionExists(prefilledRunLive)).toBe(true);
    expect(await sessionChildCount(prefilledRunLive)).toBe(1);
    expect(await sessionExists(startedFromCard)).toBe(true);
    expect(await sessionChildCount(startedFromCard)).toBe(1);
    expect(await entryExists(individualLogged)).toBe(true);

    // A session the user started is theirs even before a set is logged.
    expect(await sessionExists(startedNothingLogged)).toBe(true);
    expect(await sessionChildCount(startedNothingLogged)).toBe(1);

    // History before today is never touched.
    expect(await sessionExists(pastPrefilled)).toBe(true);
  });
});
