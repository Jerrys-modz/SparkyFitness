-- Migration: Add an optional goal day (race day) to run_programs. The Diary
-- schedule stops at it, and the app says whether the program fits before it.
-- Date: 2026-10-11

ALTER TABLE public.run_programs
    ADD COLUMN IF NOT EXISTS end_date DATE;
