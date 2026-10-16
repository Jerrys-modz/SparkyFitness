import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import { getClient } from '../db/poolManager.js';
import {
  createBike,
  createBikeComponent,
  getBikes,
  replaceBikeComponent,
  retireBikeComponent,
} from '../models/bikeRepository.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const bikeRow = {
  id: 'bike-1',
  user_id: 'user-1',
  name: 'Road',
  status: 'active',
  is_default: true,
  starting_distance_km: '100',
  starting_moving_time_seconds: 3600,
  logged_distance_km: '50',
  logged_moving_time_seconds: '7200',
  ride_count: '2',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};
const componentRow = {
  id: 'comp-1',
  user_id: 'user-1',
  bike_id: 'bike-1',
  component_type: 'chain',
  name: 'Chain',
  installed_on: '2026-02-01',
  expected_life_km: '4000',
  expected_life_hours: null,
  status: 'active',
  retired_on: null,
  notes: null,
  distance_km: '3500',
  hours: '120.5',
  ride_count: '40',
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
};

const query = vi.fn();
const release = vi.fn();
const sqlOf = (index: number) => String(query.mock.calls[index][0]);
beforeEach(() => {
  vi.clearAllMocks();
  query.mockReset();
  vi.mocked(getClient).mockResolvedValue({
    query,
    release,
  } as unknown as PoolClient);
});

describe('bike mileage and wear', () => {
  it('adds starting figures to logged ones and counts due components', async () => {
    query.mockResolvedValueOnce({ rows: [bikeRow] }).mockResolvedValueOnce({
      rows: [
        componentRow,
        { ...componentRow, id: 'comp-2', distance_km: '5000' },
        { ...componentRow, id: 'comp-3', distance_km: '10' },
      ],
    });
    const [bike] = await getBikes('user-1');
    expect(bike.total_distance_km).toBe(150);
    expect(bike.total_moving_time_seconds).toBe(10800);
    expect(bike.due_soon_component_count).toBe(1);
    expect(bike.due_now_component_count).toBe(1);
    expect(release).toHaveBeenCalledOnce();
  });

  it('counts a bike ride from its moving time, falling back to duration', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await getBikes('user-1');
    expect(sqlOf(0)).toContain(
      'COALESCE(ee.moving_time_seconds, ee.duration_minutes * 60)'
    );
  });

  it('only counts rides from the install day up to the retire day', async () => {
    query.mockResolvedValueOnce({ rows: [bikeRow] }).mockResolvedValueOnce({
      rows: [],
    });
    await getBikes('user-1');
    const componentSql = sqlOf(1);
    expect(componentSql).toContain('ee.entry_date >= c.installed_on');
    expect(componentSql).toContain('ee.entry_date < c.retired_on');
  });
});

describe('bike transactions', () => {
  it('locks a default creation before clearing the previous default', async () => {
    query.mockResolvedValue({ rows: [{ ...bikeRow }] });
    await createBike('user-1', { name: 'Road', is_default: true });
    expect(query.mock.calls[0][0]).toBe('BEGIN');
    expect(query.mock.calls[1]).toEqual([
      'SELECT pg_advisory_xact_lock(hashtext($1))',
      ['bikes:user-1'],
    ]);
    expect(sqlOf(2)).toContain('SET is_default = FALSE');
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('falls back to the type default life when none is given', async () => {
    query
      .mockResolvedValueOnce({ rowCount: 1, rows: [{}] })
      .mockResolvedValueOnce({ rows: [{ id: 'comp-1' }] })
      .mockResolvedValueOnce({ rows: [componentRow] });
    await createBikeComponent('user-1', 'bike-1', {
      component_type: 'chain',
      name: 'Chain',
      installed_on: '2026-02-01',
    });
    const params = query.mock.calls[1][1] as unknown[];
    expect(params[5]).toBe(4000);
    expect(params[6]).toBeNull();
  });

  it('returns null without inserting when the bike is not visible', async () => {
    query.mockResolvedValueOnce({ rowCount: 0, rows: [] });
    const result = await createBikeComponent('user-1', 'bike-x', {
      component_type: 'chain',
      name: 'Chain',
      installed_on: '2026-02-01',
    });
    expect(result).toBeNull();
    expect(query).toHaveBeenCalledOnce();
  });

  it('replaces by retiring the old part and installing a fresh one in one transaction', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // lock
      .mockResolvedValueOnce({ rows: [componentRow] }) // current
      .mockResolvedValueOnce({ rows: [] }) // retire
      .mockResolvedValueOnce({ rows: [{ id: 'comp-2' }] }) // insert
      .mockResolvedValueOnce({
        rows: [
          { ...componentRow, status: 'retired', retired_on: '2026-06-01' },
        ],
      })
      .mockResolvedValueOnce({
        rows: [{ ...componentRow, id: 'comp-2', distance_km: '0', hours: '0' }],
      })
      .mockResolvedValueOnce({ rows: [] }); // COMMIT
    const outcome = await replaceBikeComponent(
      'user-1',
      'bike-1',
      'comp-1',
      '2026-06-01',
      {}
    );
    expect(outcome.kind).toBe('replaced');
    if (outcome.kind !== 'replaced') return;
    expect(outcome.result.retired.status).toBe('retired');
    expect(outcome.result.installed.distance_km).toBe(0);
    expect(outcome.result.installed.wear_percent).toBe(0);
    const insertParams = query.mock.calls[4][1] as unknown[];
    expect(insertParams[2]).toBe('chain');
    expect(insertParams[4]).toBe('2026-06-01');
    expect(insertParams[5]).toBe(4000);
    expect(query.mock.calls.at(-1)?.[0]).toBe('COMMIT');
  });

  it('refuses to replace a retired part or to date a change before install', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          { ...componentRow, status: 'retired', retired_on: '2026-05-01' },
        ],
      })
      .mockResolvedValueOnce({ rows: [] });
    expect(
      (
        await replaceBikeComponent(
          'user-1',
          'bike-1',
          'comp-1',
          '2026-06-01',
          {}
        )
      ).kind
    ).toBe('already_retired');
    expect(query.mock.calls.at(-1)?.[0]).toBe('ROLLBACK');

    query.mockReset();
    query.mockResolvedValueOnce({ rows: [componentRow] });
    expect(
      (await retireBikeComponent('user-1', 'bike-1', 'comp-1', '2026-01-01'))
        .kind
    ).toBe('before_install');
  });
});
