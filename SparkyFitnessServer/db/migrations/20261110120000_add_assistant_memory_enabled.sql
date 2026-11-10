-- Migration: Let a person switch off what Sparky remembers about them (#2013)
-- Created at: 2026-11-10 12:00:00
--
-- Saved preferences (food_assistant_preferences) are now also given to the
-- chat assistant and the daily summary as background. This switch turns that
-- off without deleting what was saved. Existing accounts keep it on, which
-- matches today's behavior for the food assistant.

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS assistant_memory_enabled BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN public.user_preferences.assistant_memory_enabled IS
  'When false, Sparky does not read or save lasting preferences. Saved rows are kept.';
