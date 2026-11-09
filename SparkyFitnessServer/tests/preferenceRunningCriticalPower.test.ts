import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClient } from '../db/poolManager.js';
import preferenceRepository from '../models/preferenceRepository.js';
import preferenceService from '../services/preferenceService.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));
const query =
  vi.fn<(sql: string, params: unknown[]) => Promise<{ rows: object[] }>>();

beforeEach(() => {
  vi.clearAllMocks();
  query.mockResolvedValue({ rows: [{ user_id: 'user-1' }] });
  vi.mocked(getClient).mockResolvedValue({
    query,
    release: vi.fn(),
  } as unknown as Awaited<ReturnType<typeof getClient>>);
});

describe('running critical power preference', () => {
  it('binds the value and a "was sent" flag in both statements', async () => {
    await preferenceRepository.updateUserPreferences('user-1', {
      running_critical_power_watts: 280,
    });
    await preferenceRepository.upsertUserPreferences({
      user_id: 'user-1',
      running_critical_power_watts: 280,
    });
    const [[updateSql, updateParams], [upsertSql, upsertParams]] =
      query.mock.calls;
    for (const [sql, params] of [
      [updateSql, updateParams],
      [upsertSql, upsertParams],
    ] as const) {
      expect(sql).toContain('running_critical_power_watts = CASE WHEN $66');
      expect(params[64]).toBe(280);
      expect(params[65]).toBe(true);
    }
  });

  it('can clear the value with null, and leaves it alone when omitted', async () => {
    await preferenceRepository.updateUserPreferences('user-1', {
      running_critical_power_watts: null,
    });
    await preferenceRepository.updateUserPreferences('user-1', {});
    const [[, cleared], [, omitted]] = query.mock.calls;
    expect(cleared[64]).toBeNull();
    expect(cleared[65]).toBe(true);
    expect(omitted[64]).toBeNull();
    expect(omitted[65]).toBe(false);
  });

  it.each([49, 601, 280.5])('rejects %s watts', async (watts) => {
    await expect(
      preferenceService.updateUserPreferences('user-1', 'user-1', {
        running_critical_power_watts: watts,
      })
    ).rejects.toMatchObject({ status: 400 });
    expect(query).not.toHaveBeenCalled();
  });
});
