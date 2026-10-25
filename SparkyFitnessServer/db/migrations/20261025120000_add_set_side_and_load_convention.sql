-- Left/right set tracking and how logged load counts toward volume.
--
-- 1. exercise_entry_sets.side: which side a set was done on, for single-arm
--    and single-leg exercises. NULL = both sides together (every set logged
--    before this column existed).
-- 2. exercises.load_convention and exercise_entries.load_convention (#3157):
--    how the logged weight and reps count toward volume:
--      total    - the weight is the whole load and the reps are the total (default)
--      per_hand - the weight is one of two dumbbells, so volume counts it twice
--      per_side - reps are for each side; a set with no side did both sides
--    Only volume reads it. The weight stays as logged, and estimated 1RM and
--    weight PRs keep the logging convention. Existing rows keep today's
--    behaviour ('total'). Entries carry a copy, like modality, so a library
--    delete does not change past volume.
-- Both parts are safe to run again.

ALTER TABLE public.exercise_entry_sets ADD COLUMN IF NOT EXISTS side text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'exercise_entry_sets_side_check'
      AND conrelid = 'public.exercise_entry_sets'::regclass
  ) THEN
    ALTER TABLE public.exercise_entry_sets
      ADD CONSTRAINT exercise_entry_sets_side_check CHECK (side IN ('left', 'right'));
  END IF;
END $$;

COMMENT ON COLUMN public.exercise_entry_sets.side IS
  'Side the set was performed on: left or right. NULL = both sides together (bilateral).';

ALTER TABLE public.exercises
    ADD COLUMN IF NOT EXISTS load_convention text NOT NULL DEFAULT 'total';

ALTER TABLE public.exercise_entries
    ADD COLUMN IF NOT EXISTS load_convention text NOT NULL DEFAULT 'total';

ALTER TABLE public.exercises DROP CONSTRAINT IF EXISTS exercises_load_convention_check;
ALTER TABLE public.exercises
    ADD CONSTRAINT exercises_load_convention_check
    CHECK (load_convention IN ('total', 'per_hand', 'per_side'));

ALTER TABLE public.exercise_entries DROP CONSTRAINT IF EXISTS exercise_entries_load_convention_check;
ALTER TABLE public.exercise_entries
    ADD CONSTRAINT exercise_entries_load_convention_check
    CHECK (load_convention IN ('total', 'per_hand', 'per_side'));

COMMENT ON COLUMN public.exercises.load_convention IS
  'How logged weight and reps count toward volume: total, per_hand (weight is one of two dumbbells) or per_side (reps are per side).';
COMMENT ON COLUMN public.exercise_entries.load_convention IS
  'Copy of the exercise load_convention at logging time; updated for the owner''s entries when the exercise setting changes.';
