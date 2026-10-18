-- Migration: Personal segments. A segment is a timed stretch between two
-- points of a path (cut from a saved route or a recorded activity) that the
-- person wants to compare themselves on. There is no community here: only the
-- owner's own efforts are ever matched, stored or shown.
--
--   segments         the stretch: a simplified line, its length and bounding box
--   segment_efforts  the cached result of matching one activity's GPS track
--                    against one segment. A row with elapsed_seconds NULL means
--                    "scanned, no valid pass", so a track is never re-read
--                    until it changes (the attach route clears its rows).
--
-- Both tables are owner-only (Tier 1): where someone runs is personal.
-- Date: 2026-10-18

CREATE TABLE IF NOT EXISTS public.segments (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name VARCHAR(100),
    activity VARCHAR(10) NOT NULL DEFAULT 'run'
        CHECK (activity IN ('run', 'walk', 'ride', 'hike')),
    length_m DOUBLE PRECISION NOT NULL CHECK (length_m > 0),
    points JSONB NOT NULL DEFAULT '[]'::jsonb,
    min_lat DOUBLE PRECISION NOT NULL,
    min_lon DOUBLE PRECISION NOT NULL,
    max_lat DOUBLE PRECISION NOT NULL,
    max_lon DOUBLE PRECISION NOT NULL,
    source_route_id UUID
        REFERENCES public.routes(id) ON DELETE SET NULL,
    source_exercise_entry_id UUID
        REFERENCES public.exercise_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_segments_user_updated
    ON public.segments (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_segments_source_route
    ON public.segments (source_route_id)
    WHERE source_route_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.segment_efforts (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    segment_id UUID NOT NULL REFERENCES public.segments(id) ON DELETE CASCADE,
    exercise_entry_id UUID NOT NULL
        REFERENCES public.exercise_entries(id) ON DELETE CASCADE,
    entry_date DATE NOT NULL,
    started_at TIMESTAMPTZ,
    elapsed_seconds DOUBLE PRECISION,
    avg_speed_mps DOUBLE PRECISION,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_segment_efforts_segment_entry
        UNIQUE (segment_id, exercise_entry_id),
    CONSTRAINT chk_segment_efforts_matched
        CHECK ((elapsed_seconds IS NULL) = (started_at IS NULL)
               AND (elapsed_seconds IS NULL OR elapsed_seconds > 0))
);

CREATE INDEX IF NOT EXISTS idx_segment_efforts_segment_started
    ON public.segment_efforts (segment_id, started_at DESC)
    WHERE elapsed_seconds IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_segment_efforts_entry
    ON public.segment_efforts (exercise_entry_id);
