-- Migration: Add the Diary schedule to run_programs, like a workout plan's:
-- the weekdays the person plans to run (none means every day), the first day
-- the workout is offered, and the last day a program workout was completed.
-- Date: 2026-10-11

ALTER TABLE public.run_programs
    ADD COLUMN IF NOT EXISTS run_days SMALLINT[] NOT NULL DEFAULT '{}'
        CHECK (run_days <@ ARRAY[0, 1, 2, 3, 4, 5, 6]::SMALLINT[]),
    ADD COLUMN IF NOT EXISTS start_date DATE,
    ADD COLUMN IF NOT EXISTS last_done_date DATE;
