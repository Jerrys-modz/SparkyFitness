-- Migration: One sleep entry per user, night and source
-- File: SparkyFitnessServer/db/migrations/20261006180000_unique_sleep_entry_per_night_and_source.sql
--
-- Two overlapping syncs could each find no entry for a night and both insert
-- one. Keep the most recently updated entry of each night and source (each
-- sync writes the whole night, and a later manual edit also counts as newest),
-- delete the rest with their stages, then enforce one entry per night and
-- source so upsertSleepEntry can rely on ON CONFLICT.

BEGIN;

-- Stop new entries for a night arriving between the cleanup and the index.
LOCK TABLE public.sleep_entries IN SHARE ROW EXCLUSIVE MODE;

DELETE FROM public.sleep_entries s
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, entry_date, source
           ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
         ) AS position
  FROM public.sleep_entries
) ranked
WHERE s.id = ranked.id
  AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS sleep_entries_user_date_source_key
  ON public.sleep_entries (user_id, entry_date, source);

COMMIT;
