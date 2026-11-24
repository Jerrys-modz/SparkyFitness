-- Migration: Let a person leave one run out of the estimated VO2 max (#2248).
-- File: SparkyFitnessServer/db/migrations/20261124130000_add_exclude_from_vo2_estimate.sql
--
-- Every qualifying run in the last six weeks counts toward the estimate. A hilly
-- trail run, a race or a run with a bad heart rate strap can skew it, so the
-- person can switch one run off. Set only by POST /exercise-entries/:id/vo2-estimate;
-- it is not a telemetry column, so syncs and edits leave it alone. No new table,
-- so no RLS change.
ALTER TABLE public.exercise_entries
  ADD COLUMN IF NOT EXISTS exclude_from_vo2_estimate boolean NOT NULL DEFAULT false;
