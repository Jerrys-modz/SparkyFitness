-- Migration: Add an optional goal day (race day) to run_programs. The Diary
-- schedule stops at it, and the app says whether the program fits before it.
-- The goal day cannot be before the first day, whichever request sets it.
-- Date: 2026-10-11

ALTER TABLE public.run_programs
    ADD COLUMN IF NOT EXISTS end_date DATE;

-- Clear any goal day that already falls before the first day, so the check can be added.
UPDATE public.run_programs
SET end_date = NULL
WHERE end_date IS NOT NULL
  AND start_date IS NOT NULL
  AND end_date < start_date;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'chk_run_programs_end_after_start'
          AND conrelid = 'public.run_programs'::regclass
    ) THEN
        ALTER TABLE public.run_programs
            ADD CONSTRAINT chk_run_programs_end_after_start
            CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date);
    END IF;
END $$;
