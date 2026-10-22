/**
 * Personal segments — integration test.
 *
 * The segment routes are tested with a mocked repository, which cannot prove
 * what lives in Postgres: the owner-only RLS policies on `segments` and
 * `segment_efforts`, the cascades, the one-row-per-(segment, activity) upsert,
 * the per-person cap lock, or that the app role has grants on both tables. This
 * drives `segmentRepository` through the RLS-enforced `getClient` path with two
 * people and a switched (delegated) context.
 *
 * It seeds and deletes only its own synthetic `@example.test` users. Like the
 * other integration tests it SKIPS when no database is reachable.
 */
import pg from 'pg';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { SEGMENT_MAX_PER_USER, segmentSummarySchema } from '@workspace/shared';
import { endPool, getSystemClient } from '../db/poolManager.js';
import {
  clearEntryEfforts,
  createSegment,
  deleteSegment,
  getMatchableSegment,
  getSegmentRow,
  listEntryEfforts,
  listSegmentEfforts,
  listSegments,
  listUnmatchedCandidates,
  renameSegment,
  saveEfforts,
  SegmentLimitError,
  type NewSegment,
} from '../models/segmentRepository.js';

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
    await probe.end().catch(() => {});
  }
}

const RUN = await dbReachable();

const ALICE = '00000000-0000-4000-c000-0000000000c1';
const BOB = '00000000-0000-4000-c000-0000000000c2';
const ENTRY = '00000000-0000-4000-c000-0000000000f1';
const BOB_ENTRY = '00000000-0000-4000-c000-0000000000f2';

const line = [
  { lat: 40, lon: -74 },
  { lat: 40.005, lon: -74 },
  { lat: 40.01, lon: -74 },
];
const draft: NewSegment = {
  name: 'Hill',
  activity: 'run',
  lengthM: 1112,
  points: line,
  bounds: { minLat: 40, minLon: -74, maxLat: 40.01, maxLon: -74 },
  sourceRouteId: null,
  sourceExerciseEntryId: null,
};
const pass = (segmentId: string, exerciseEntryId: string, seconds: number) => ({
  segmentId,
  exerciseEntryId,
  entryDate: '2026-10-01',
  pass: {
    startedAtMs: Date.parse('2026-10-01T07:00:00Z'),
    elapsedSeconds: seconds,
    avgSpeedMps: 1112 / seconds,
  },
});

describe.runIf(RUN)('segmentRepository against Postgres', () => {
  const clean = async () => {
    const sys = await getSystemClient();
    try {
      for (const table of ['segment_efforts', 'segments', 'exercise_entries']) {
        await sys.query(`DELETE FROM public.${table} WHERE user_id = ANY($1)`, [
          [ALICE, BOB],
        ]);
      }
      await sys.query('DELETE FROM public."user" WHERE id = ANY($1)', [
        [ALICE, BOB],
      ]);
    } finally {
      sys.release();
    }
  };

  beforeAll(async () => {
    await clean();
    const sys = await getSystemClient();
    try {
      for (const id of [ALICE, BOB]) {
        await sys.query(
          'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
          [id, `segments-${id}@example.test`]
        );
      }
      for (const [entry, user] of [
        [ENTRY, ALICE],
        [BOB_ENTRY, BOB],
      ] as const) {
        await sys.query(
          `INSERT INTO public.exercise_entries
             (id, user_id, exercise_name, entry_date, duration_minutes, calories_burned)
           VALUES ($1, $2, 'Morning run', '2026-10-01', 30, 300)`,
          [entry, user]
        );
        await sys.query(
          `INSERT INTO public.exercise_entry_gps_points
             (user_id, exercise_entry_id, entry_date, points)
           VALUES ($1, $2, '2026-10-01', $3::jsonb)`,
          [
            user,
            entry,
            JSON.stringify([
              { t: '2026-10-01T07:00:00Z', lat: 40, lon: -74 },
              { t: '2026-10-01T07:05:00Z', lat: 40.01, lon: -74 },
            ]),
          ]
        );
      }
    } finally {
      sys.release();
    }
  });

  afterAll(async () => {
    await clean();
    await endPool();
  });

  it('creates, lists and renames a segment in the contract shape', async () => {
    const created = await createSegment(ALICE, draft);
    expect(segmentSummarySchema.parse(created)).toEqual(created);
    expect(created.effortCount).toBe(0);
    expect((await listSegments(ALICE)).map((s) => s.id)).toContain(created.id);
    const renamed = await renameSegment(ALICE, created.id, null);
    expect(renamed?.name).toBeNull();
    expect(await deleteSegment(ALICE, created.id)).toBe(true);
  });

  it('keeps segments and efforts private, including from a switched context', async () => {
    const mine = await createSegment(ALICE, draft);
    await saveEfforts(ALICE, [pass(mine.id, ENTRY, 300)]);

    expect(await getSegmentRow(BOB, mine.id)).toBeNull();
    expect(await listSegments(BOB)).toEqual([]);
    expect(await renameSegment(BOB, mine.id, 'x')).toBeNull();
    expect(await deleteSegment(BOB, mine.id)).toBe(false);
    expect(await listSegmentEfforts(BOB, mine.id)).toEqual([]);

    // Bob acting for Alice is refused by the owner-only policy.
    expect(await getSegmentRow(ALICE, mine.id, BOB)).toBeNull();
    expect(await listSegments(ALICE, BOB)).toEqual([]);
    expect(await listSegmentEfforts(ALICE, mine.id, BOB)).toEqual([]);
    await expect(createSegment(ALICE, draft, BOB)).rejects.toThrow();

    expect(await listSegmentEfforts(ALICE, mine.id)).toHaveLength(1);
    await deleteSegment(ALICE, mine.id);
  });

  it('upserts one effort per activity and caches a no-pass', async () => {
    const seg = await createSegment(ALICE, draft);
    await saveEfforts(ALICE, [pass(seg.id, ENTRY, 300)]);
    await saveEfforts(ALICE, [pass(seg.id, ENTRY, 280)]);
    const efforts = await listSegmentEfforts(ALICE, seg.id);
    expect(efforts.map((e) => e.elapsedSeconds)).toEqual([280]);
    expect(
      (await listEntryEfforts(ALICE, ENTRY)).map((e) => e.effort.segmentId)
    ).toEqual([seg.id]);

    await clearEntryEfforts(ALICE, ENTRY);
    expect(await listSegmentEfforts(ALICE, seg.id)).toEqual([]);

    await saveEfforts(ALICE, [
      {
        segmentId: seg.id,
        exerciseEntryId: ENTRY,
        entryDate: '2026-10-01',
        pass: null,
      },
    ]);
    expect(await listSegmentEfforts(ALICE, seg.id)).toEqual([]);
    const matchable = await getMatchableSegment(ALICE, seg.id);
    expect(matchable).not.toBeNull();
    // The cached "no pass" keeps the activity out of the candidates.
    expect(await listUnmatchedCandidates(ALICE, matchable!, 10, 0.001)).toEqual(
      []
    );
    await deleteSegment(ALICE, seg.id);
  });

  it('never writes an effort for another person’s segment', async () => {
    const seg = await createSegment(ALICE, draft);
    await saveEfforts(BOB, [pass(seg.id, BOB_ENTRY, 300)]);
    expect(await listSegmentEfforts(ALICE, seg.id)).toEqual([]);
    await deleteSegment(ALICE, seg.id);
  });

  it('finds the person’s own tracks near a segment, and only theirs', async () => {
    const seg = await createSegment(ALICE, draft);
    const matchable = await getMatchableSegment(ALICE, seg.id);
    const found = await listUnmatchedCandidates(ALICE, matchable!, 10, 0.001);
    expect(found.map((c) => c.entryId)).toEqual([ENTRY]);
    await deleteSegment(ALICE, seg.id);
  });

  it('removes efforts with their segment and enforces the per-person cap', async () => {
    const seg = await createSegment(ALICE, draft);
    await saveEfforts(ALICE, [pass(seg.id, ENTRY, 300)]);
    await deleteSegment(ALICE, seg.id);
    const sys = await getSystemClient();
    try {
      const left = await sys.query(
        'SELECT 1 FROM public.segment_efforts WHERE segment_id = $1',
        [seg.id]
      );
      expect(left.rowCount).toBe(0);
      await sys.query(
        `INSERT INTO public.segments (user_id, name, activity, length_m, points, min_lat, min_lon, max_lat, max_lon)
         SELECT $1, 'bulk', 'run', 1, '[]'::jsonb, 0, 0, 0, 0 FROM generate_series(1, $2)`,
        [ALICE, SEGMENT_MAX_PER_USER]
      );
    } finally {
      sys.release();
    }
    await expect(createSegment(ALICE, draft)).rejects.toBeInstanceOf(
      SegmentLimitError
    );
  });
});
