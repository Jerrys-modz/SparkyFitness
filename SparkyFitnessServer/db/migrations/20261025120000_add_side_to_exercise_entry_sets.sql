-- Which side a set was done on, for single-arm and single-leg exercises.
-- NULL = both sides together (every set logged before this column existed).
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
