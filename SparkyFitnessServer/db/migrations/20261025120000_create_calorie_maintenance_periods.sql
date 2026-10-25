-- Migration: Create calorie_maintenance_periods, days on which the calorie
-- target is worked out with Goal Mode set to Maintain: a refeed day (one day)
-- or a diet break (a few days to a few weeks). The saved calorie settings are
-- not touched, so the deficit resumes by itself when the period ends.
-- Date: 2026-10-25

CREATE TABLE IF NOT EXISTS public.calorie_maintenance_periods (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('refeed_day', 'diet_break')),
    -- Calendar days in the person's timezone; both ends are included.
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    note VARCHAR(200),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_calorie_maintenance_periods_order CHECK (end_date >= start_date),
    -- A refeed is a single day; a break is at most four weeks.
    CONSTRAINT chk_calorie_maintenance_periods_length CHECK (
        (kind = 'refeed_day' AND end_date = start_date)
        OR (kind = 'diet_break' AND end_date - start_date <= 27)
    )
);

COMMENT ON TABLE public.calorie_maintenance_periods IS
  'Refeed days and diet breaks: days whose calorie target is computed with goal_mode = maintain. Overlapping rows are harmless; a day inside any of them is a maintenance day.';

CREATE INDEX IF NOT EXISTS idx_calorie_maintenance_periods_user_dates
    ON public.calorie_maintenance_periods (user_id, start_date, end_date);
