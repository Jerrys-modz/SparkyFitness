-- Migration: Add target_body_fat_percentage to onboarding_data
-- Description: A body-fat % goal next to the goal weight, for people doing body
-- recomposition. Stored the same way as target_weight (one nullable column on
-- the owner's onboarding_data row, written only by the owner through
-- PUT /api/onboarding/target-body-fat). NULL means no goal. The range matches
-- BODY_FAT_GOAL_MIN_PERCENT / BODY_FAT_GOAL_MAX_PERCENT in
-- shared/src/utils/bodyFatGoal.ts. The table's existing RLS policies cover the
-- new column (owner writes, profile-read delegates read), so none change.
-- Date: 2026-11-16

ALTER TABLE public.onboarding_data
  ADD COLUMN IF NOT EXISTS target_body_fat_percentage NUMERIC(4, 1);

ALTER TABLE public.onboarding_data
  DROP CONSTRAINT IF EXISTS onboarding_data_target_body_fat_percentage_range;

ALTER TABLE public.onboarding_data
  ADD CONSTRAINT onboarding_data_target_body_fat_percentage_range
    CHECK (
      target_body_fat_percentage IS NULL
      OR target_body_fat_percentage BETWEEN 3 AND 60
    );

COMMENT ON COLUMN public.onboarding_data.target_body_fat_percentage IS
  'Target body fat percentage (3 to 60), or NULL for no goal. Set beside target_weight on the Goals page; drives the Body Fat % chart goal line and projected goal date.';
