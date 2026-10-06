/**
 * Sleep entries are unique per user, night and source. The migration keeps
 * the newest duplicate of a night, and upsertSleepEntry then updates through
 * the unique key, so overlapping syncs for one night leave one entry.
 *
 * Skipped unless a test database is reachable: the migration's cleanup is
 * unscoped, so fixture ids alone could not protect a normal database.
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { endPool } from '../db/poolManager.js';
import sleepRepository from '../models/sleepRepository.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_SQL = readFileSync(
  path.join(
    here,
    '../db/migrations/20261006180000_unique_sleep_entry_per_night_and_source.sql'
  ),
  'utf8'
);

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

describe.runIf(RUN)('one sleep entry per night and source', () => {
  let db: pg.Client;
  const userId = randomUUID();

  const insertEntry = async (
    entryDate: string,
    source: string,
    updatedAt: string,
    sleepScore: number
  ) =>
    (
      await db.query(
        `INSERT INTO public.sleep_entries
           (user_id, entry_date, bedtime, wake_time, duration_in_seconds,
            source, sleep_score, created_at, updated_at)
         VALUES ($1, $2, $2::date - interval '2 hours', $2::date + interval '6 hours',
                 28800, $3, $4, $5, $5)
         RETURNING id`,
        [userId, entryDate, source, sleepScore, updatedAt]
      )
    ).rows[0].id as string;

  const entriesFor = async (entryDate: string, source: string) =>
    (
      await db.query(
        `SELECT id, sleep_score FROM public.sleep_entries
         WHERE user_id = $1 AND entry_date = $2 AND source = $3`,
        [userId, entryDate, source]
      )
    ).rows;

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    await db.query(
      'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
      [userId, `sleep-unique-${userId}@example.test`]
    );
  });

  afterAll(async () => {
    await db.query('DELETE FROM public."user" WHERE id = $1', [userId]);
    await db.end();
    await endPool();
  });

  it('keeps the newest entry of a night and source, with its stages', async () => {
    // The test database is already migrated, so remove the index to recreate
    // the duplicates the migration has to clean up.
    await db.query(
      'DROP INDEX IF EXISTS public.sleep_entries_user_date_source_key'
    );
    const older = await insertEntry(
      '2026-09-01',
      'Withings',
      '2026-09-02T08:00:00Z',
      70
    );
    const newest = await insertEntry(
      '2026-09-01',
      'Withings',
      '2026-09-02T09:00:00Z',
      80
    );
    const otherSource = await insertEntry(
      '2026-09-01',
      'Fitbit',
      '2026-09-02T07:00:00Z',
      60
    );
    const otherNight = await insertEntry(
      '2026-09-02',
      'Withings',
      '2026-09-03T07:00:00Z',
      65
    );
    for (const entryId of [older, newest]) {
      await db.query(
        `INSERT INTO public.sleep_entry_stages
           (entry_id, user_id, stage_type, start_time, end_time, duration_in_seconds)
         VALUES ($1, $2, 'deep', '2026-09-01T01:00:00Z', '2026-09-01T02:00:00Z', 3600)`,
        [entryId, userId]
      );
    }

    await db.query(MIGRATION_SQL);

    expect(await entriesFor('2026-09-01', 'Withings')).toEqual([
      { id: newest, sleep_score: 80 },
    ]);
    expect((await entriesFor('2026-09-01', 'Fitbit'))[0].id).toBe(otherSource);
    expect((await entriesFor('2026-09-02', 'Withings'))[0].id).toBe(otherNight);
    const stages = await db.query(
      'SELECT entry_id FROM public.sleep_entry_stages WHERE user_id = $1',
      [userId]
    );
    expect(stages.rows).toEqual([{ entry_id: newest }]);
    await expect(
      insertEntry('2026-09-01', 'Withings', '2026-09-02T10:00:00Z', 90)
    ).rejects.toThrow(/sleep_entries_user_date_source_key/);
  });

  it('saves one entry when two writes for the same night overlap', async () => {
    const write = (sleepScore: number) =>
      sleepRepository.upsertSleepEntry(userId, userId, {
        entry_date: '2026-09-10',
        bedtime: '2026-09-09T22:00:00Z',
        wake_time: '2026-09-10T06:00:00Z',
        duration_in_seconds: 28800,
        sleep_score: sleepScore,
        source: 'Oura',
      });

    const [a, b] = await Promise.all([write(75), write(85)]);

    const rows = await entriesFor('2026-09-10', 'Oura');
    expect(rows).toHaveLength(1);
    expect(a.id).toBe(rows[0].id);
    expect(b.id).toBe(rows[0].id);
    expect([75, 85]).toContain(rows[0].sleep_score);
  });
});
