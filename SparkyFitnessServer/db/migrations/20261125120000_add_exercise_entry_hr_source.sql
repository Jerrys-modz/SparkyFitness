-- Where an exercise entry's heart rate was measured when the app attached it
-- during a live workout: the paired watch, or headphones with a sensor read
-- through the phone. NULL for everything else (synced workouts, manual entries,
-- entries from before this column), which clients show without a label.
ALTER TABLE public.exercise_entries
  ADD COLUMN IF NOT EXISTS hr_source text;

ALTER TABLE public.exercise_entries
  DROP CONSTRAINT IF EXISTS exercise_entries_hr_source_check;
ALTER TABLE public.exercise_entries
  ADD CONSTRAINT exercise_entries_hr_source_check
  CHECK (hr_source IS NULL OR hr_source IN ('watch', 'headphones'));
