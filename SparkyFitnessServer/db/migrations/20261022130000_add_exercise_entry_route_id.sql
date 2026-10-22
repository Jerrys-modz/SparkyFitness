-- Migration: Link a finished run or walk to the saved route it followed.
-- exercise_entries.route_id is nullable and cleared (not cascaded) when the
-- route is deleted, so the diary entry stays. The API only sets it to a route
-- owned by the entry's user; access to the column follows the entry's own
-- diary policies and the route itself stays owner-only.
-- Date: 2026-10-22

ALTER TABLE public.exercise_entries
    ADD COLUMN IF NOT EXISTS route_id UUID
        REFERENCES public.routes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_entries_route
    ON public.exercise_entries (route_id, entry_date DESC)
    WHERE route_id IS NOT NULL;
