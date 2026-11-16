-- Migration: Create diet_phases, a person's dated diet plan such as
-- cut -> maintain -> cut. Each phase sets Goal Mode to the weekly weight
-- change mode with its own rate for the days it covers; days outside every
-- phase keep the person's own Goal Mode setting. Non-overlap and the rule that
-- edits never change a past day are enforced by the server (diet phase
-- service), because a phase may end early when its weight target is reached.
-- Date: 2026-11-16

CREATE TABLE IF NOT EXISTS public.diet_phases (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    phase_type TEXT NOT NULL
        CHECK (phase_type IN ('loss', 'maintenance', 'gain')),
    -- Magnitude in kg per week (gram precision); the sign comes from phase_type.
    weekly_change_kg NUMERIC(5, 3) NOT NULL DEFAULT 0
        CHECK (weekly_change_kg >= 0 AND weekly_change_kg <= 2),
    start_date DATE NOT NULL,
    -- Last day of the phase (inclusive). Either this or duration_weeks.
    end_date DATE,
    duration_weeks INTEGER
        CHECK (duration_weeks IS NULL OR (duration_weeks >= 1 AND duration_weeks <= 104)),
    -- Ends the phase once the smoothed weight trend reaches it.
    target_weight_kg NUMERIC(6, 2)
        CHECK (target_weight_kg IS NULL OR (target_weight_kg > 0 AND target_weight_kg <= 1000)),
    -- The day the server saw the trend reach the target: the phase's last day.
    target_reached_on DATE,
    label VARCHAR(60),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT chk_diet_phases_end_or_duration
        CHECK (end_date IS NULL OR duration_weeks IS NULL),
    CONSTRAINT chk_diet_phases_has_end
        CHECK (end_date IS NOT NULL OR duration_weeks IS NOT NULL OR target_weight_kg IS NOT NULL),
    CONSTRAINT chk_diet_phases_end_after_start
        CHECK (end_date IS NULL OR end_date >= start_date),
    CONSTRAINT chk_diet_phases_maintenance
        CHECK (phase_type <> 'maintenance' OR (weekly_change_kg = 0 AND target_weight_kg IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_diet_phases_user_start
    ON public.diet_phases (user_id, start_date);
