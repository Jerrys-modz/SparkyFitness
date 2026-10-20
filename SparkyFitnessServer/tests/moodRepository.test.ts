import { beforeEach, describe, expect, it, vi } from 'vitest';
import moodRepository, { hasMoodContent } from '../models/moodRepository.js';

const query = vi.fn();
const release = vi.fn();

vi.mock('../db/poolManager.js', () => ({
  getClient: vi.fn(async () => ({ query, release })),
}));

describe('moodRepository', () => {
  beforeEach(() => {
    query.mockReset();
    release.mockReset();
    query.mockResolvedValue({ rows: [{ id: 'm1' }] });
  });

  describe('hasMoodContent', () => {
    it('is false for blank notes and empty tags', () => {
      expect(hasMoodContent({ notes: '  ', moodTags: [] })).toBe(false);
      expect(hasMoodContent({})).toBe(false);
    });

    it('is true when any single field carries content', () => {
      expect(hasMoodContent({ energyValue: 2 })).toBe(true);
      expect(hasMoodContent({ moodValue: 0 })).toBe(true);
      expect(hasMoodContent({ focusValue: 1 })).toBe(true);
      expect(hasMoodContent({ notes: 'ok' })).toBe(true);
      expect(hasMoodContent({ moodTags: ['calm'] })).toBe(true);
    });
  });

  describe('createCheckin', () => {
    it('always inserts a manual row and never uses ON CONFLICT', async () => {
      await moodRepository.createCheckin('u1', {
        moodValue: 60,
        entryDate: '2026-10-20',
        energyValue: 3,
      });
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('INSERT INTO mood_entries');
      expect(sql).not.toContain('ON CONFLICT');
      expect(sql).toContain("'manual'");
      expect(sql).toContain('COALESCE($8::timestamptz, now())');
      expect(params[0]).toBe('u1');
      expect(params[1]).toBe(60);
      expect(params[4]).toBe('2026-10-20');
      expect(params[5]).toBe(3);
      expect(params[7]).toBeNull();
    });
  });

  describe('upsertDerivedMood', () => {
    it('upserts on the derived-source partial unique index', async () => {
      await moodRepository.upsertDerivedMood('u1', 'garmin', {
        moodValue: 70,
        entryDate: '2026-10-20',
        entryTimestamp: '2026-10-20T08:00:00Z',
      });
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain(
        "ON CONFLICT (user_id, entry_date, source) WHERE source <> 'manual'"
      );
      expect(sql).toContain('DO UPDATE');
      expect(params).toContain('garmin');
      expect(params).toContain('2026-10-20T08:00:00Z');
    });
  });

  describe('legacy reads', () => {
    it('prefers the latest manual row with a mood and falls back to derived', async () => {
      await moodRepository.getLegacyMoodEntryForDate('u1', '2026-10-20');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('mood_value IS NOT NULL');
      expect(sql).toMatch(
        /ORDER BY \(source = 'manual'\) DESC, entry_timestamp DESC, created_at DESC\s+LIMIT 1/
      );
      expect(params).toEqual(['u1', '2026-10-20']);
    });

    it('returns one row per day in a range, newest day first', async () => {
      await moodRepository.getLegacyMoodEntriesInRange(
        'u1',
        '2026-10-01',
        '2026-10-31'
      );
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain('DISTINCT ON (entry_date)');
      expect(sql).toContain('mood_value IS NOT NULL');
      expect(sql).toContain(
        "ORDER BY entry_date DESC, (source = 'manual') DESC, entry_timestamp DESC, created_at DESC"
      );
      expect(params).toEqual(['u1', '2026-10-01', '2026-10-31']);
    });
  });

  describe('upsertLegacyMoodEntry', () => {
    it('updates the existing manual mood row in place', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1', mood_value: 60 }] });
      const row = await moodRepository.upsertLegacyMoodEntry('u1', {
        moodValue: 60,
        entryDate: '2026-10-20',
        energyValue: null,
      });
      expect(query).toHaveBeenCalledTimes(2);
      const [lookupSql, lookupParams] = query.mock.calls[0];
      expect(lookupSql).toContain("source = 'manual'");
      expect(lookupSql).toContain('mood_value IS NOT NULL');
      expect(lookupSql).toContain(
        'ORDER BY entry_timestamp DESC, created_at DESC'
      );
      expect(lookupParams).toEqual(['u1', '2026-10-20']);
      const [updateSql, updateParams] = query.mock.calls[1];
      expect(updateSql).toContain('UPDATE mood_entries');
      expect(updateSql).not.toContain('INSERT');
      expect(updateParams[0]).toBe('legacy-1');
      expect(updateParams[1]).toBe('u1');
      expect(row).toEqual({ id: 'legacy-1', mood_value: 60 });
    });

    it('inserts a manual row when no legacy row exists', async () => {
      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ id: 'new-1' }] });
      await moodRepository.upsertLegacyMoodEntry('u1', {
        moodValue: 60,
        entryDate: '2026-10-20',
      });
      expect(query).toHaveBeenCalledTimes(2);
      const [sql] = query.mock.calls[1];
      expect(sql).toContain('INSERT INTO mood_entries');
      expect(sql).toContain("'manual'");
      expect(sql).not.toContain('ON CONFLICT');
    });

    it('keeps stored ratings when the caller sends none', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] });
      await moodRepository.upsertLegacyMoodEntry('u1', {
        moodValue: 60,
        entryDate: '2026-10-20',
      });
      const [sql, params] = query.mock.calls[1];
      expect(sql).toMatch(/energy_value = CASE WHEN \$\d+ THEN/);
      expect(params.slice(-4)).toEqual([null, false, null, false]);
    });

    it('clears a rating the caller explicitly nulls', async () => {
      query
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'legacy-1' }] });
      await moodRepository.upsertLegacyMoodEntry('u1', {
        moodValue: 60,
        entryDate: '2026-10-20',
        energyValue: null,
        focusValue: 3,
      });
      expect(query.mock.calls[1][1].slice(-4)).toEqual([null, true, 3, true]);
    });
  });

  describe('getCheckinsForDate', () => {
    it('returns manual rows only, in time order', async () => {
      await moodRepository.getCheckinsForDate('u1', '2026-10-20');
      const [sql, params] = query.mock.calls[0];
      expect(sql).toContain("source = 'manual'");
      expect(sql).toContain('ORDER BY entry_timestamp ASC, created_at ASC');
      expect(params).toEqual(['u1', '2026-10-20']);
    });
  });

  describe('getMoodEntriesByUserId', () => {
    it('orders by day then check-in time, newest first', async () => {
      await moodRepository.getMoodEntriesByUserId(
        'u1',
        '2026-10-01',
        '2026-10-31'
      );
      expect(query.mock.calls[0][0]).toContain(
        'ORDER BY entry_date DESC, entry_timestamp DESC'
      );
    });
  });

  describe('updateMoodEntryFields', () => {
    it('sets flag false for every field when the patch is empty', async () => {
      await moodRepository.updateMoodEntryFields('m1', 'u1', {});
      const [sql, params] = query.mock.calls[0];
      expect(sql).not.toContain('entry_date =');
      expect(params).toEqual([
        'm1',
        'u1',
        false,
        null,
        false,
        null,
        false,
        null,
        false,
        null,
        false,
        null,
        false,
        null,
      ]);
    });

    it('clears a field with an explicit null and sets supplied ones', async () => {
      await moodRepository.updateMoodEntryFields('m1', 'u1', {
        notes: null,
        energyValue: 4,
        moodTags: ['calm'],
        entryTimestamp: '2026-10-20T10:00:00Z',
      });
      const params = query.mock.calls[0][1];
      // [id, user, mood flag, mood, notes flag, notes, tags flag, tags,
      //  energy flag, energy, focus flag, focus, timestamp flag, timestamp]
      expect(params.slice(2)).toEqual([
        false,
        null,
        true,
        null,
        true,
        ['calm'],
        true,
        4,
        false,
        null,
        true,
        '2026-10-20T10:00:00Z',
      ]);
    });

    it('uses a CASE flag for all six fields', async () => {
      await moodRepository.updateMoodEntryFields('m1', 'u1', { moodValue: 50 });
      const sql = query.mock.calls[0][0];
      for (const column of [
        'mood_value',
        'notes',
        'mood_tags',
        'energy_value',
        'focus_value',
        'entry_timestamp',
      ]) {
        expect(sql).toContain(`${column} = CASE WHEN $`);
        expect(sql).toContain(`ELSE ${column} END`);
      }
    });
  });

  describe('deprecated wrappers', () => {
    it('createOrUpdateMoodEntry delegates to the legacy upsert without ON CONFLICT (user_id, entry_date)', async () => {
      await moodRepository.createOrUpdateMoodEntry(
        'u1',
        60,
        null,
        '2026-10-20'
      );
      const sqls = query.mock.calls.map((c) => c[0] as string).join('\n');
      expect(sqls).not.toContain('ON CONFLICT (user_id, entry_date)');
    });

    it('updateMoodEntry keeps omitted ratings and sets supplied ones', async () => {
      await moodRepository.updateMoodEntry('m1', 'u1', null, undefined, null, {
        focusValue: 5,
      });
      const params = query.mock.calls[0][1];
      // mood, notes, tags absent; energy absent; focus set
      expect(params.slice(2)).toEqual([
        false,
        null,
        false,
        null,
        false,
        null,
        false,
        null,
        true,
        5,
        false,
        null,
      ]);
    });
  });

  it('returns energy, focus, timestamp and source from every read', async () => {
    await moodRepository.getMoodEntryByDate('u1', '2026-10-20');
    expect(query.mock.calls[0][0]).toContain('energy_value, focus_value');
    expect(query.mock.calls[0][0]).toContain('entry_timestamp, source');
  });
});
