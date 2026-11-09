-- Migration: Add running_critical_power_watts to user_preferences
-- Description: Lets a runner set their own critical power (watts) so running power
-- zones do not depend on a single run's best 20 minutes. NULL means "estimate it
-- from the run", which is how power zones worked before this column existed.
-- Date: 2026-11-09

ALTER TABLE public.user_preferences
  ADD COLUMN IF NOT EXISTS running_critical_power_watts INTEGER;

ALTER TABLE public.user_preferences
  DROP CONSTRAINT IF EXISTS user_preferences_running_critical_power_watts_check;
ALTER TABLE public.user_preferences
  ADD CONSTRAINT user_preferences_running_critical_power_watts_check
    CHECK (running_critical_power_watts IS NULL
           OR running_critical_power_watts BETWEEN 50 AND 600);

COMMENT ON COLUMN public.user_preferences.running_critical_power_watts IS
  'Runner''s own critical power in watts (50 to 600), the base of the five running power zones. NULL = estimate from the run.';
