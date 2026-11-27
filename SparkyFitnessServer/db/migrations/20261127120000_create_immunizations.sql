-- Migration: Immunization records (#2765). One row per vaccine a person has had.
-- A dated one-off record, so it lives beside lab results rather than in the
-- medication tables (no schedules, adherence or reminders ride on it).

CREATE TABLE IF NOT EXISTS public.immunizations (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    vaccine_name TEXT NOT NULL,
    vaccine_code TEXT,
    administered_on DATE NOT NULL,
    dose_number INTEGER,
    lot_number TEXT,
    administered_by TEXT,
    site TEXT,
    next_due_on DATE,
    notes TEXT,
    source TEXT NOT NULL DEFAULT 'manual',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL,
    updated_by_user_id UUID REFERENCES public."user"(id) ON DELETE SET NULL,
    CONSTRAINT immunizations_source_check
        CHECK (source IN ('manual', 'import')),
    CONSTRAINT immunizations_dose_number_check
        CHECK (dose_number IS NULL OR dose_number BETWEEN 1 AND 20),
    CONSTRAINT immunizations_due_after_given_check
        CHECK (next_due_on IS NULL OR next_due_on >= administered_on)
);

CREATE INDEX IF NOT EXISTS idx_immunizations_user_date
    ON public.immunizations(user_id, administered_on DESC);
CREATE INDEX IF NOT EXISTS idx_immunizations_user_due
    ON public.immunizations(user_id, next_due_on)
    WHERE next_due_on IS NOT NULL;

COMMENT ON TABLE public.immunizations IS 'One vaccine a person has had: name, date, dose, lot, who gave it and an optional next-due date.';
COMMENT ON COLUMN public.immunizations.vaccine_code IS 'Optional standard vaccine code (for example a CDC CVX code). Free text; not validated.';
COMMENT ON COLUMN public.immunizations.source IS 'How the record got here: manual, or import (read from a PDF or photo).';
