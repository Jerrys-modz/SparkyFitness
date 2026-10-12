-- Migration: Remember which diary entry each finished run program workout was
-- done as, so the activity can be shown as part of the program.
-- Date: 2026-10-12

ALTER TABLE public.run_programs
    ADD COLUMN IF NOT EXISTS completion_log JSONB NOT NULL DEFAULT '[]'::jsonb;
