-- Several mood check-ins per day. Every rating is optional, so a row needs only
-- some content (mood, energy, focus, notes or tags). entry_timestamp orders a
-- day's check-ins; source separates manual check-ins from rows derived from
-- Garmin stress or health-data imports, of which there is one per day each.
--
-- unique_user_date is a constraint on most installs and a plain unique index on
-- others, so it is dropped as a constraint first and then as an index.
-- The content CHECK is added NOT VALID and validated in a second transaction so
-- the scan does not hold the add-constraint lock. The runner sends one file as
-- one query; the COMMIT is what splits it.
BEGIN;

ALTER TABLE public.mood_entries ADD COLUMN IF NOT EXISTS entry_timestamp TIMESTAMPTZ;
UPDATE public.mood_entries SET entry_timestamp = created_at WHERE entry_timestamp IS NULL;
ALTER TABLE public.mood_entries ALTER COLUMN entry_timestamp SET NOT NULL;
ALTER TABLE public.mood_entries ALTER COLUMN entry_timestamp SET DEFAULT now();

ALTER TABLE public.mood_entries ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'manual';
UPDATE public.mood_entries SET source = 'garmin' WHERE notes LIKE 'Derived from Garmin Stress:%';

ALTER TABLE public.mood_entries ALTER COLUMN mood_value DROP NOT NULL;

ALTER TABLE public.mood_entries DROP CONSTRAINT IF EXISTS mood_entries_has_content;
ALTER TABLE public.mood_entries ADD CONSTRAINT mood_entries_has_content
  CHECK (
    mood_value IS NOT NULL
    OR energy_value IS NOT NULL
    OR focus_value IS NOT NULL
    OR (notes IS NOT NULL AND btrim(notes) <> '')
    OR cardinality(mood_tags) > 0
  ) NOT VALID;

ALTER TABLE public.mood_entries DROP CONSTRAINT IF EXISTS unique_user_date;
DROP INDEX IF EXISTS public.unique_user_date;

CREATE UNIQUE INDEX IF NOT EXISTS mood_entries_derived_source_day
  ON public.mood_entries (user_id, entry_date, source) WHERE source <> 'manual';
CREATE INDEX IF NOT EXISTS mood_entries_user_day_time
  ON public.mood_entries (user_id, entry_date, entry_timestamp);

COMMIT;

BEGIN;
ALTER TABLE public.mood_entries VALIDATE CONSTRAINT mood_entries_has_content;
COMMIT;
