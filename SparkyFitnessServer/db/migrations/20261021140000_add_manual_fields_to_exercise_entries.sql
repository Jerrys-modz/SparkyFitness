-- Names of the fields a user edited on a synced exercise entry. A re-sent
-- provider workout (matched by source_id) leaves these fields alone.
ALTER TABLE public.exercise_entries
  ADD COLUMN manual_fields text[] NOT NULL DEFAULT '{}'::text[];
