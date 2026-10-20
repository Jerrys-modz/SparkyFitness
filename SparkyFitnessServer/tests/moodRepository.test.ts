import { beforeEach, describe, expect, it, vi } from 'vitest';
import moodRepository from '../models/moodRepository.js';

const query = vi.fn();
const release = vi.fn();

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(async () => ({ query, release })),
}));

describe('moodRepository energy and focus', () => {
  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    query.mockResolvedValue({ rows: [{ id: 'm1' }] });
  });

  it('keeps stored ratings when the caller sends none', async () => {
    await moodRepository.createOrUpdateMoodEntry('u1', 60, null, '2026-10-20');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toMatch(
      /energy_value = CASE WHEN \$\d+ THEN EXCLUDED\.energy_value ELSE mood_entries\.energy_value END/
    );
    expect(params).toEqual([
      'u1',
      60,
      null,
      null,
      '2026-10-20',
      null,
      false,
      null,
      false,
    ]);
  });

  it('keeps the stored journal when the caller sends no notes', async () => {
    await moodRepository.createOrUpdateMoodEntry('u1', 60, null, '2026-10-20');
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(
      'notes = COALESCE(EXCLUDED.notes, mood_entries.notes)'
    );
    expect(params[3]).toBeNull();
  });

  it('clears a rating the caller explicitly nulls', async () => {
    await moodRepository.createOrUpdateMoodEntry(
      'u1',
      60,
      null,
      '2026-10-20',
      null,
      { energyValue: null, focusValue: 3 }
    );
    expect(query.mock.calls[0][1].slice(5)).toEqual([null, true, 3, true]);
  });

  it('update keeps omitted ratings and sets supplied ones', async () => {
    await moodRepository.updateMoodEntry('m1', 'u1', null, undefined, null, {
      focusValue: 5,
    });
    expect(query.mock.calls[0][1].slice(5)).toEqual([null, false, 5, true]);
  });

  it('returns energy and focus from every read', async () => {
    await moodRepository.getMoodEntryByDate('u1', '2026-10-20');
    expect(query.mock.calls[0][0]).toContain('energy_value, focus_value');
  });
});
