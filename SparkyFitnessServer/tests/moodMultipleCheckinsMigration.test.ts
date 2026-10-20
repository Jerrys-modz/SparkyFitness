import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const MIGRATION = join(
  here,
  '../db/migrations/20261021000000_multiple_mood_checkins.sql'
);

/**
 * Migration 20261021000000 lets a day hold several mood check-ins. The old
 * one-per-day unique is a constraint on most installs and an index on others,
 * so both drops are required, constraint first.
 */
describe('multiple mood check-ins migration', () => {
  const raw = readFileSync(MIGRATION, 'utf8');
  const sql = raw
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .replace(/\s+/g, ' ');

  it('adds entry_timestamp, backfills it from created_at, then makes it required with a default', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS entry_timestamp TIMESTAMPTZ/i
    );
    expect(sql).toMatch(
      /UPDATE public\.mood_entries SET entry_timestamp = created_at WHERE entry_timestamp IS NULL/i
    );
    expect(sql).toMatch(/ALTER COLUMN entry_timestamp SET NOT NULL/i);
    expect(sql).toMatch(/ALTER COLUMN entry_timestamp SET DEFAULT now\(\)/i);
    expect(sql.search(/entry_timestamp = created_at/i)).toBeLessThan(
      sql.search(/entry_timestamp SET NOT NULL/i)
    );
  });

  it('adds source and marks Garmin-derived rows', () => {
    expect(sql).toMatch(
      /ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual'/i
    );
    expect(sql).toMatch(
      /SET source = 'garmin' WHERE notes LIKE 'Derived from Garmin Stress:%'/i
    );
  });

  it('makes mood_value optional', () => {
    expect(sql).toMatch(/ALTER COLUMN mood_value DROP NOT NULL/i);
  });

  it('requires some content, added NOT VALID and validated in a later transaction', () => {
    const check =
      /ADD CONSTRAINT mood_entries_has_content CHECK \( ?mood_value IS NOT NULL OR energy_value IS NOT NULL OR focus_value IS NOT NULL OR \(notes IS NOT NULL AND btrim\(notes\) <> ''\) OR cardinality\(mood_tags\) > 0 ?\) NOT VALID/i;
    expect(sql).toMatch(check);
    expect(sql).toMatch(/VALIDATE CONSTRAINT mood_entries_has_content/i);
    expect(
      sql.search(/COMMIT; BEGIN; ALTER TABLE public\.mood_entries VALIDATE/i)
    ).toBeGreaterThan(sql.search(/NOT VALID/i));
  });

  it('drops the old unique as a constraint first, then as an index', () => {
    const dropConstraint = sql.search(
      /ALTER TABLE public\.mood_entries DROP CONSTRAINT IF EXISTS unique_user_date;/i
    );
    const dropIndex = sql.search(
      /DROP INDEX IF EXISTS public\.unique_user_date;/i
    );
    expect(dropConstraint).toBeGreaterThanOrEqual(0);
    expect(dropIndex).toBeGreaterThan(dropConstraint);
  });

  it('keeps one derived row per source per day and indexes the day lookup', () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS mood_entries_derived_source_day ON public\.mood_entries \(user_id, entry_date, source\) WHERE source <> 'manual';/i
    );
    expect(sql).toMatch(
      /CREATE INDEX IF NOT EXISTS mood_entries_user_day_time ON public\.mood_entries \(user_id, entry_date, entry_timestamp\);/i
    );
  });
});
