import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  client: { query: vi.fn(), release: vi.fn() },
}));

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(async () => mocks.client),
  getSystemClient: vi.fn(async () => mocks.client),
}));

import aiCoachRepository from '../models/aiCoachRepository.js';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('clearNudgesForDay', () => {
  it('removes the day’s messages from the chat too, in one transaction', async () => {
    mocks.client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE FROM coach_nudges')) {
        return {
          rowCount: 2,
          rows: [{ chat_message_id: 'm1' }, { chat_message_id: 'm2' }],
        };
      }
      return { rowCount: 0, rows: [] };
    });

    const cleared = await aiCoachRepository.clearNudgesForDay(
      'u1',
      '2026-11-25'
    );

    expect(cleared).toBe(2);
    const sqls = mocks.client.query.mock.calls.map((call) => call[0]);
    expect(sqls[0]).toBe('BEGIN');
    const chatDelete = mocks.client.query.mock.calls.find((call) =>
      String(call[0]).includes('DELETE FROM sparky_chat_history')
    );
    expect(chatDelete?.[1]).toEqual(['u1', ['m1', 'm2']]);
    expect(sqls.at(-1)).toBe('COMMIT');
    expect(mocks.client.release).toHaveBeenCalledOnce();
  });

  it('touches no chat message when there was nothing to clear', async () => {
    mocks.client.query.mockResolvedValue({ rowCount: 0, rows: [] });
    expect(await aiCoachRepository.clearNudgesForDay('u1', '2026-11-25')).toBe(
      0
    );
    expect(
      mocks.client.query.mock.calls.some((call) =>
        String(call[0]).includes('sparky_chat_history')
      )
    ).toBe(false);
  });

  it('rolls back when a delete fails', async () => {
    mocks.client.query.mockImplementation(async (sql: string) => {
      if (sql.includes('sparky_chat_history')) throw new Error('boom');
      if (sql.includes('DELETE FROM coach_nudges')) {
        return { rowCount: 1, rows: [{ chat_message_id: 'm1' }] };
      }
      return { rowCount: 0, rows: [] };
    });
    await expect(
      aiCoachRepository.clearNudgesForDay('u1', '2026-11-25')
    ).rejects.toThrow('boom');
    expect(mocks.client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mocks.client.release).toHaveBeenCalledOnce();
  });
});

describe('getLastDayWithSignal', () => {
  it('finds the last day a message was sent because of the signal', async () => {
    mocks.client.query.mockResolvedValue({ rows: [{ day: '2026-11-24' }] });
    expect(
      await aiCoachRepository.getLastDayWithSignal(
        'u1',
        'new_prs_since_last_checkin'
      )
    ).toBe('2026-11-24');
    expect(mocks.client.query.mock.calls[0][1]).toEqual([
      'u1',
      JSON.stringify([{ signal: 'new_prs_since_last_checkin' }]),
    ]);
  });
});
