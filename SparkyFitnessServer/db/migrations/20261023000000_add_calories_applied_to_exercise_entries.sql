-- Calories an entry contributes to the daily calorie balance. NULL means the
-- entry's own estimate (calories_burned) counts, as before. A value (0 or more)
-- replaces it, so a workout that a watch also recorded is not counted twice
-- while the original estimate stays stored in calories_burned.
ALTER TABLE public.exercise_entries ADD COLUMN IF NOT EXISTS calories_applied numeric;
ALTER TABLE public.exercise_entries DROP CONSTRAINT IF EXISTS chk_exercise_entries_calories_applied;
ALTER TABLE public.exercise_entries
  ADD CONSTRAINT chk_exercise_entries_calories_applied
  CHECK (calories_applied IS NULL OR calories_applied >= 0);
