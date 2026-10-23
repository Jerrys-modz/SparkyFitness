-- Links a workout logged in SparkyFitness to the same session synced from a
-- watch or health platform, so its calories count once. Both sides carry the
-- same calorie_link_id; calories_applied (20261023000000) holds what each
-- side counts and calories_burned keeps each side's own estimate.
ALTER TABLE public.exercise_entries ADD COLUMN IF NOT EXISTS calorie_link_id uuid;
ALTER TABLE public.exercise_entries ADD COLUMN IF NOT EXISTS calorie_link_resolution text;
ALTER TABLE public.exercise_entries DROP CONSTRAINT IF EXISTS chk_exercise_entries_calorie_link_resolution;
ALTER TABLE public.exercise_entries
  ADD CONSTRAINT chk_exercise_entries_calorie_link_resolution
  CHECK (
    calorie_link_resolution IS NULL
    OR calorie_link_resolution IN ('sparkyfitness', 'synced', 'higher', 'lower', 'average', 'custom')
  );
CREATE INDEX IF NOT EXISTS idx_exercise_entries_calorie_link_id
  ON public.exercise_entries (calorie_link_id)
  WHERE calorie_link_id IS NOT NULL;
