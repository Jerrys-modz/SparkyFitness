-- Migration: Create run_programs, a person's multi-week run program and their
-- place in it (one row per user). `workouts` is the person's own copy of the
-- program's workouts, so the AI assistant can adjust upcoming ones.
-- Date: 2026-10-10

CREATE TABLE IF NOT EXISTS public.run_programs (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    program_id VARCHAR(50) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    next_index INTEGER NOT NULL DEFAULT 0 CHECK (next_index >= 0),
    workouts JSONB NOT NULL DEFAULT '[]'::jsonb,
    adjustment_log JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_run_programs_user UNIQUE (user_id)
);
