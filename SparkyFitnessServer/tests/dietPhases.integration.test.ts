/**
 * Diet phases against a real database, as the app role, so grants and
 * row-level security apply: the owner saves and reads the plan, a family
 * member with a grant reads it but cannot change it, a stranger sees nothing,
 * two saves at once never both pass their checks against the same old plan,
 * and a reached target is recorded once.
 *
 * Skipped unless a test database is reachable.
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { endPool } from '../db/poolManager.js';
import dietPhaseRepository from '../models/dietPhaseRepository.js';
import type { DietPhaseToSave } from '../models/dietPhaseRepository.js';
import { planDietPhaseSave } from '../services/dietPhaseService.js';

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

const phase = (
  start_date: string,
  overrides: Partial<DietPhaseToSave> = {}
): DietPhaseToSave => ({
  phase_type: 'loss',
  weekly_change_kg: 0.5,
  start_date,
  end_date: null,
  duration_weeks: 4,
  target_weight_kg: null,
  target_reached_on: null,
  label: null,
  ...overrides,
});

describe.runIf(RUN)('diet phases in the database', () => {
  let db: pg.Client;
  const owner = randomUUID();
  const delegate = randomUUID();
  const stranger = randomUUID();

  beforeAll(async () => {
    db = ownerClient();
    await db.connect();
    for (const [id, tag] of [
      [owner, 'owner'],
      [delegate, 'delegate'],
      [stranger, 'stranger'],
    ]) {
      await db.query(
        'INSERT INTO public."user" (id, email, email_verified) VALUES ($1, $2, true)',
        [id, `diet-phases-${tag}-${id}@example.test`]
      );
    }
    await db.query(
      `INSERT INTO public.family_access
         (owner_user_id, family_user_id, family_email, access_permissions, is_active, status)
       VALUES ($1, $2, $3, $4::jsonb, true, 'active')`,
      [
        owner,
        delegate,
        `${delegate}@example.test`,
        JSON.stringify({ can_manage_diary: true }),
      ]
    );
  });

  beforeEach(async () => {
    await db.query('DELETE FROM public.diet_phases WHERE user_id = $1', [
      owner,
    ]);
  });

  afterAll(async () => {
    await db.query(
      'DELETE FROM public.family_access WHERE owner_user_id = $1',
      [owner]
    );
    await db.query('DELETE FROM public."user" WHERE id = ANY($1::uuid[])', [
      [owner, delegate, stranger],
    ]);
    await db.end();
    await endPool();
  });

  it('saves a plan, keeps ids on update and removes phases not sent', async () => {
    const first = await dietPhaseRepository.replaceDietPhases(owner, () => [
      phase('2027-01-04'),
      phase('2027-02-01', {
        phase_type: 'maintenance',
        weekly_change_kg: 0,
        duration_weeks: null,
        end_date: '2027-02-14',
        label: 'Break',
      }),
    ]);
    expect(first.map((p) => [p.start_date, p.phase_type, p.end_date])).toEqual([
      ['2027-01-04', 'loss', null],
      ['2027-02-01', 'maintenance', '2027-02-14'],
    ]);
    expect(first[0]).toMatchObject({
      weekly_change_kg: 0.5,
      duration_weeks: 4,
    });

    const kept = first[0]!;
    const second = await dietPhaseRepository.replaceDietPhases(owner, () => [
      { ...phase('2027-01-04'), id: kept.id, weekly_change_kg: 0.75 },
    ]);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ id: kept.id, weekly_change_kg: 0.75 });
  });

  it('lets a family member read the plan but not change it', async () => {
    await dietPhaseRepository.replaceDietPhases(owner, () => [
      phase('2027-01-04'),
    ]);
    const seen = await dietPhaseRepository.getDietPhases(owner, delegate);
    expect(seen).toHaveLength(1);

    // Row-level security refuses the insert outright.
    await expect(
      dietPhaseRepository.replaceDietPhases(
        owner,
        () => [phase('2027-03-01')],
        delegate
      )
    ).rejects.toThrow(/row-level security/);
    // The update a delegate tries touches no row.
    await dietPhaseRepository.markDietPhaseTargetReached(
      owner,
      seen[0]!.id,
      '2027-01-10',
      delegate
    );
    const stored = await dietPhaseRepository.getDietPhases(owner);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.target_reached_on).toBeNull();
  });

  it('shows a stranger nothing', async () => {
    await dietPhaseRepository.replaceDietPhases(owner, () => [
      phase('2027-01-04'),
    ]);
    expect(await dietPhaseRepository.getDietPhases(owner, stranger)).toEqual(
      []
    );
  });

  it('checks two saves at once against each other, not the same old plan', async () => {
    const today = '2026-12-01';
    const body = (start: string) => ({
      phases: [
        {
          phase_type: 'loss' as const,
          weekly_change_kg: 0.5,
          start_date: start,
          end_date: null,
          duration_weeks: 4,
          target_weight_kg: null,
          label: null,
        },
      ],
    });
    // Each save adds one phase to what it sees stored. Without the lock both
    // would see an empty plan and the second would silently drop the first.
    const addTo = (start: string) =>
      dietPhaseRepository.replaceDietPhases(owner, (existing) =>
        planDietPhaseSave(
          existing,
          {
            phases: [
              ...existing.map((p) => ({
                id: p.id,
                phase_type: p.phase_type,
                weekly_change_kg: p.weekly_change_kg,
                start_date: p.start_date,
                end_date: p.end_date,
                duration_weeks: p.duration_weeks,
                target_weight_kg: p.target_weight_kg,
                label: p.label,
              })),
              ...body(start).phases,
            ],
          },
          today
        )
      );
    await Promise.all([addTo('2027-01-04'), addTo('2027-03-01')]);
    const stored = await dietPhaseRepository.getDietPhases(owner);
    expect(stored.map((p) => p.start_date)).toEqual([
      '2027-01-04',
      '2027-03-01',
    ]);
  });

  it('records a reached target once', async () => {
    const [saved] = await dietPhaseRepository.replaceDietPhases(owner, () => [
      phase('2027-01-04', { duration_weeks: null, target_weight_kg: 80 }),
    ]);
    await dietPhaseRepository.markDietPhaseTargetReached(
      owner,
      saved!.id,
      '2027-02-01'
    );
    await dietPhaseRepository.markDietPhaseTargetReached(
      owner,
      saved!.id,
      '2027-03-01'
    );
    const [stored] = await dietPhaseRepository.getDietPhases(owner);
    expect(stored!.target_reached_on).toBe('2027-02-01');
  });

  it('refuses rows the table checks reject', async () => {
    await expect(
      dietPhaseRepository.replaceDietPhases(owner, () => [
        phase('2027-01-04', {
          phase_type: 'maintenance',
          weekly_change_kg: 0.5,
        }),
      ])
    ).rejects.toThrow(/chk_diet_phases_maintenance/);
    expect(await dietPhaseRepository.getDietPhases(owner)).toEqual([]);
  });

  it('reads logged weights in kg for the target check', async () => {
    await db.query(
      `INSERT INTO public.check_in_measurements (user_id, entry_date, weight)
       VALUES ($1, '2027-01-05', 82.4), ($1, '2027-01-07', NULL)`,
      [owner]
    );
    try {
      expect(
        await dietPhaseRepository.getWeightsInRange(
          owner,
          '2027-01-01',
          '2027-01-31'
        )
      ).toEqual([{ date: '2027-01-05', weight: 82.4 }]);
    } finally {
      await db.query(
        'DELETE FROM public.check_in_measurements WHERE user_id = $1',
        [owner]
      );
    }
  });
});
