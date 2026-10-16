/**
 * Lab report imports tag their results with an import_id so they can be
 * deleted apart from results typed by hand, and a lab marker can be removed
 * together with its results (custom measurements have no foreign key to their
 * category).
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import measurementRepository from '../models/measurementRepository.js';
import {
  deleteImportedLabResults,
  deleteLabMarkerWithResults,
} from '../models/labResultRepository.js';

function ownerClient() {
  return new pg.Client({
    host: process.env.SPARKY_FITNESS_DB_HOST,
    port: Number(process.env.SPARKY_FITNESS_DB_PORT) || 5432,
    database: process.env.SPARKY_FITNESS_DB_NAME,
    user: process.env.SPARKY_FITNESS_DB_USER,
    password: process.env.SPARKY_FITNESS_DB_PASSWORD,
    connectionTimeoutMillis: 2000,
  });
}

async function isDbReachable(): Promise<boolean> {
  if (process.env.SKIP_RLS_MATRIX === '1') return false;
  if (!process.env.SPARKY_FITNESS_DB_HOST) return false;
  if (!/(^|[_-])test([_-]|$)/i.test(process.env.SPARKY_FITNESS_DB_NAME ?? ''))
    return false;
  const probe = ownerClient();
  try {
    await probe.connect();
    await probe.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await probe.end().catch(() => {});
  }
}

const RUN = await isDbReachable();

afterAll(async () => {
  if (RUN) await endPool();
});

describe.runIf(RUN)('deleting imported lab results', () => {
  let db: pg.Client;
  const userId = randomUUID();
  const importA = randomUUID();
  const importB = randomUUID();
  const ids = {
    hba1c: randomUUID(),
    ldl: randomUUID(),
    mood: randomUUID(),
  };

  const category = (id: string, name: string, isLab: boolean) =>
    db.query(
      `INSERT INTO public.custom_categories
         (id, user_id, name, measurement_type, frequency, data_type, is_lab)
       VALUES ($1, $2, $3, 'x', 'Daily', 'numeric', $4)`,
      [id, userId, name, isLab]
    );

  const save = (
    categoryId: string,
    date: string,
    value: number,
    importId?: string
  ) =>
    measurementRepository.upsertCustomMeasurement(
      userId,
      userId,
      categoryId,
      value,
      date,
      null,
      null,
      null,
      'Daily',
      'manual',
      'UTC',
      importId
    );

  const countFor = async (categoryId: string) =>
    Number(
      (
        await db.query(
          'SELECT count(*) FROM public.custom_measurements WHERE category_id = $1',
          [categoryId]
        )
      ).rows[0].count
    );

  const categoryExists = async (id: string) =>
    (
      await db.query('SELECT 1 FROM public.custom_categories WHERE id = $1', [
        id,
      ])
    ).rows.length > 0;

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `lab-import-${userId}@example.test`]
    );
    await category(ids.hba1c, 'hba1c', true);
    await category(ids.ldl, 'ldl', true);
    await category(ids.mood, 'mood-score', false);
  });

  afterAll(async () => {
    await db.query(
      'DELETE FROM public.custom_measurements WHERE user_id = $1',
      [userId]
    );
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
  });

  it('stores the import id, and a later hand-typed save of that day clears it', async () => {
    const row = await save(ids.hba1c, '2026-09-12', 5.1, importA);
    expect(row.import_id).toBe(importA);

    const retyped = await save(ids.hba1c, '2026-09-12', 5.2);
    expect(retyped.id).toBe(row.id);
    expect(retyped.import_id).toBeNull();
  });

  it('deletes only imported results, then markers left empty', async () => {
    await db.query(
      'DELETE FROM public.custom_measurements WHERE user_id = $1',
      [userId]
    );
    await save(ids.hba1c, '2026-09-12', 5.1, importA);
    await save(ids.hba1c, '2026-03-01', 5.4); // typed by hand
    await save(ids.ldl, '2026-09-12', 130, importA);
    await save(ids.mood, '2026-09-12', 7);

    const outcome = await deleteImportedLabResults(userId);

    expect(outcome).toEqual({ results: 2, markers: 1 });
    expect(await countFor(ids.hba1c)).toBe(1); // the hand-typed one stays
    expect(await categoryExists(ids.hba1c)).toBe(true);
    expect(await categoryExists(ids.ldl)).toBe(false); // emptied marker is removed
    expect(await countFor(ids.mood)).toBe(1); // not a lab marker
    expect(await categoryExists(ids.mood)).toBe(true);
  });

  it('can delete just one import', async () => {
    await category(ids.ldl, 'ldl', true);
    await db.query(
      'DELETE FROM public.custom_measurements WHERE user_id = $1',
      [userId]
    );
    await save(ids.hba1c, '2026-09-12', 5.1, importA);
    await save(ids.ldl, '2026-09-12', 130, importB);

    const outcome = await deleteImportedLabResults(userId, importB);

    expect(outcome.results).toBe(1);
    expect(await countFor(ids.hba1c)).toBe(1);
    expect(await countFor(ids.ldl)).toBe(0);
  });

  it('deletes a lab marker with its results, and refuses other categories', async () => {
    await save(ids.hba1c, '2026-01-01', 4.9);

    expect(await deleteLabMarkerWithResults(userId, ids.mood)).toBeNull();
    expect(await categoryExists(ids.mood)).toBe(true);

    const outcome = await deleteLabMarkerWithResults(userId, ids.hba1c);
    expect(outcome?.results).toBeGreaterThanOrEqual(2);
    expect(await countFor(ids.hba1c)).toBe(0);
    expect(await categoryExists(ids.hba1c)).toBe(false);
  });

  it("never touches another user's results", async () => {
    const other = randomUUID();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [other, `lab-import-${other}@example.test`]
    );
    const otherCategory = randomUUID();
    await db.query(
      `INSERT INTO public.custom_categories
         (id, user_id, name, measurement_type, frequency, data_type, is_lab)
       VALUES ($1, $2, 'hba1c', '%', 'Daily', 'numeric', true)`,
      [otherCategory, other]
    );
    await db.query(
      `INSERT INTO public.custom_measurements
         (user_id, category_id, value, entry_date, import_id, source)
       VALUES ($1, $2, '5.5', '2026-09-12', $3, 'manual')`,
      [other, otherCategory, importA]
    );

    await deleteImportedLabResults(userId);

    expect(await countFor(otherCategory)).toBe(1);
    await db.query(
      'DELETE FROM public.custom_measurements WHERE user_id = $1',
      [other]
    );
    await db.query('DELETE FROM public."user" WHERE id = $1', [other]);
  });
});
