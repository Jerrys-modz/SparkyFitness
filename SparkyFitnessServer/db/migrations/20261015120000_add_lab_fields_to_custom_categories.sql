-- Lab results ride on custom categories: a lab marker is a category flagged
-- is_lab, with an optional reference range. The unit is stored as entered in
-- measurement_type. Access is unchanged (the existing check-in RLS policy).
ALTER TABLE public.custom_categories
  ADD COLUMN IF NOT EXISTS is_lab boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ref_range_low double precision,
  ADD COLUMN IF NOT EXISTS ref_range_high double precision;

ALTER TABLE public.custom_categories
  DROP CONSTRAINT IF EXISTS custom_categories_ref_range_check;
ALTER TABLE public.custom_categories
  ADD CONSTRAINT custom_categories_ref_range_check
  CHECK (ref_range_low IS NULL OR ref_range_high IS NULL OR ref_range_low <= ref_range_high);

COMMENT ON COLUMN public.custom_categories.is_lab IS 'True for lab-result markers (HbA1c, LDL, ...); these are listed under Lab results instead of the generic custom measurements.';
COMMENT ON COLUMN public.custom_categories.ref_range_low IS 'Lower bound of the reference range, in the category unit (measurement_type). NULL when unknown.';
COMMENT ON COLUMN public.custom_categories.ref_range_high IS 'Upper bound of the reference range, in the category unit (measurement_type). NULL when unknown.';
