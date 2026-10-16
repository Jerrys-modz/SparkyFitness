-- Migration: Create bikes and bike components, and link exercise entries to a bike
-- Date: 2026-10-16
-- Bikes sit beside the shoes table; nothing in public.shoes is touched.

CREATE TABLE IF NOT EXISTS public.bikes (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    brand VARCHAR(120),
    model VARCHAR(120),
    purchase_date DATE,
    purchase_price NUMERIC(10, 2),
    -- Distance and moving time the bike already carried when it was added.
    starting_distance_km NUMERIC(9, 2) NOT NULL DEFAULT 0,
    starting_moving_time_seconds INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    retired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public."user"(id),
    updated_by_user_id UUID REFERENCES public."user"(id),
    CONSTRAINT bikes_status_check CHECK (status IN ('active', 'retired')),
    CONSTRAINT bikes_starting_check CHECK (
        starting_distance_km >= 0 AND starting_moving_time_seconds >= 0
    )
);

CREATE INDEX IF NOT EXISTS idx_bikes_user_status
    ON public.bikes(user_id, status);

-- At most one default bike per user.
CREATE UNIQUE INDEX IF NOT EXISTS idx_bikes_user_default
    ON public.bikes(user_id)
    WHERE is_default;

CREATE TABLE IF NOT EXISTS public.bike_components (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    bike_id UUID NOT NULL REFERENCES public.bikes(id) ON DELETE CASCADE,
    component_type VARCHAR(30) NOT NULL,
    name VARCHAR(120) NOT NULL,
    -- Rides on the bike from this day on wear the component.
    installed_on DATE NOT NULL,
    -- Expected life; either or both may be set, the larger wear ratio wins.
    expected_life_km NUMERIC(9, 2),
    expected_life_hours NUMERIC(8, 2),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- Rides before this day count; replacement keeps the old row as history.
    retired_on DATE,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by_user_id UUID REFERENCES public."user"(id),
    updated_by_user_id UUID REFERENCES public."user"(id),
    CONSTRAINT bike_components_type_check CHECK (
        component_type IN (
            'chain', 'cassette', 'tires', 'brake_pads', 'cables', 'bar_tape',
            'custom'
        )
    ),
    CONSTRAINT bike_components_status_check CHECK (status IN ('active', 'retired')),
    CONSTRAINT bike_components_life_check CHECK (
        (expected_life_km IS NOT NULL OR expected_life_hours IS NOT NULL)
        AND (expected_life_km IS NULL OR expected_life_km > 0)
        AND (expected_life_hours IS NULL OR expected_life_hours > 0)
    ),
    CONSTRAINT bike_components_retired_check CHECK (
        (status = 'retired') = (retired_on IS NOT NULL)
        AND (retired_on IS NULL OR retired_on >= installed_on)
    )
);

CREATE INDEX IF NOT EXISTS idx_bike_components_bike
    ON public.bike_components(bike_id, status);

CREATE INDEX IF NOT EXISTS idx_bike_components_user
    ON public.bike_components(user_id);

-- A ride keeps its bike link when the bike is retired; deleting a bike only
-- clears the link (the diary entry stays intact).
ALTER TABLE public.exercise_entries
    ADD COLUMN IF NOT EXISTS bike_id UUID REFERENCES public.bikes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exercise_entries_bike_id
    ON public.exercise_entries(bike_id)
    WHERE bike_id IS NOT NULL;
