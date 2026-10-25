-- Migration: Create shopping_list_items, a person's shopping list (one list per
-- user). Each row is an item to buy with an optional quantity, unit and note,
-- and whether it has been checked off.
-- Date: 2026-10-25

CREATE TABLE IF NOT EXISTS public.shopping_list_items (
    id UUID DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL CHECK (length(btrim(name)) > 0),
    quantity NUMERIC(10, 2) CHECK (quantity IS NULL OR quantity > 0),
    unit VARCHAR(50),
    note VARCHAR(500),
    is_checked BOOLEAN NOT NULL DEFAULT FALSE,
    checked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shopping_list_items_user
    ON public.shopping_list_items (user_id, is_checked, created_at);
