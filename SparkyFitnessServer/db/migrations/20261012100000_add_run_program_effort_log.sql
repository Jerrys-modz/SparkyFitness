-- Migration: Remember how hard each finished run program workout felt (1 to 10),
-- so the app and the assistant can suggest easing off or moving on.
-- Date: 2026-10-12

ALTER TABLE public.run_programs
    ADD COLUMN IF NOT EXISTS effort_log JSONB NOT NULL DEFAULT '[]'::jsonb;
