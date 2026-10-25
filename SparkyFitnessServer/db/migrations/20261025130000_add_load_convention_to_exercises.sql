-- Migration: Add load_convention to exercises and exercise_entries (#3157).
-- It says how the logged weight and reps count toward volume:
--   total    - the weight is the whole load and the reps are the total (default)
--   per_hand - the weight is one of two dumbbells, so volume counts it twice
--   per_side - reps are for each side; a set with no side did both sides
-- Only volume reads it. The weight stays as logged, and estimated 1RM and
-- weight PRs keep the logging convention. Existing rows keep today's
-- behaviour ('total'). Entries carry a copy, like modality, so a library
-- delete does not change past volume.
-- Date: 2026-10-25

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
