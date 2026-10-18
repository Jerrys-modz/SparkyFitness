-- Migration: Record where a fitness test was run (outdoors with GPS or indoors
-- on a treadmill) and, for a treadmill, the incline and whether the result was
-- corrected for it. Existing tests were all recorded outdoors. The table keeps
-- its owner-only policy; no access change.
-- Date: 2026-10-18

ALTER TABLE public.fitness_tests
    ADD COLUMN IF NOT EXISTS surface VARCHAR(10) NOT NULL DEFAULT 'outdoor'
        CHECK (surface IN ('outdoor', 'indoor')),
    ADD COLUMN IF NOT EXISTS incline_percent NUMERIC(3, 1)
        CHECK (incline_percent IS NULL OR (incline_percent >= 0 AND incline_percent <= 15)),
    ADD COLUMN IF NOT EXISTS incline_adjusted BOOLEAN NOT NULL DEFAULT FALSE;
