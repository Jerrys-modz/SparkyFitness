-- Optional day a person wants to reach their goal weight, and the day the goal
-- or date was last set (where the planned path on the charts starts). Both stay
-- NULL for existing rows, so nothing changes until someone picks a date.
ALTER TABLE public.onboarding_data
  ADD COLUMN IF NOT EXISTS target_weight_date DATE,
  ADD COLUMN IF NOT EXISTS target_weight_set_on DATE;

COMMENT ON COLUMN public.onboarding_data.target_weight_date IS
  'Calendar day the person wants to reach target_weight. Advisory only: it suggests a weekly pace and never changes calorie goals by itself.';
COMMENT ON COLUMN public.onboarding_data.target_weight_set_on IS
  'Calendar day (profile timezone) the goal weight or its date last changed; the start of the planned path.';
