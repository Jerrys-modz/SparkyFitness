-- Protein and fat goals in grams per kg of body weight or lean mass.
-- The setting lives on the dated goal row (and on goal presets, which weekly
-- goal plans point to), so a past day keeps the setting it had, and its grams
-- follow the latest weight measured on or before that day. NULL means the
-- macro is set in grams or as a percentage, as before, so nobody's targets
-- change until they choose the new unit. `protein` / `fat` keep the grams
-- worked out when the goal was saved, used when no weight is logged.
-- The bounds match MACRO_PER_KG_LIMITS in shared/src/utils/macroPerKg.ts.

ALTER TABLE public.user_goals
ADD COLUMN IF NOT EXISTS protein_per_kg NUMERIC(4, 2);

ALTER TABLE public.user_goals
ADD COLUMN IF NOT EXISTS fat_per_kg NUMERIC(4, 2);

ALTER TABLE public.user_goals
ADD COLUMN IF NOT EXISTS macro_per_kg_basis TEXT NOT NULL DEFAULT 'body_weight';

ALTER TABLE public.user_goals
DROP CONSTRAINT IF EXISTS chk_user_goals_protein_per_kg;
ALTER TABLE public.user_goals
ADD CONSTRAINT chk_user_goals_protein_per_kg
  CHECK (protein_per_kg IS NULL OR (protein_per_kg >= 0.1 AND protein_per_kg <= 5));

ALTER TABLE public.user_goals
DROP CONSTRAINT IF EXISTS chk_user_goals_fat_per_kg;
ALTER TABLE public.user_goals
ADD CONSTRAINT chk_user_goals_fat_per_kg
  CHECK (fat_per_kg IS NULL OR (fat_per_kg >= 0.1 AND fat_per_kg <= 3));

ALTER TABLE public.user_goals
DROP CONSTRAINT IF EXISTS chk_user_goals_macro_per_kg_basis;
ALTER TABLE public.user_goals
ADD CONSTRAINT chk_user_goals_macro_per_kg_basis
  CHECK (macro_per_kg_basis IN ('body_weight', 'lean_mass'));

ALTER TABLE public.goal_presets
ADD COLUMN IF NOT EXISTS protein_per_kg NUMERIC(4, 2);

ALTER TABLE public.goal_presets
ADD COLUMN IF NOT EXISTS fat_per_kg NUMERIC(4, 2);

ALTER TABLE public.goal_presets
ADD COLUMN IF NOT EXISTS macro_per_kg_basis TEXT NOT NULL DEFAULT 'body_weight';

ALTER TABLE public.goal_presets
DROP CONSTRAINT IF EXISTS chk_goal_presets_protein_per_kg;
ALTER TABLE public.goal_presets
ADD CONSTRAINT chk_goal_presets_protein_per_kg
  CHECK (protein_per_kg IS NULL OR (protein_per_kg >= 0.1 AND protein_per_kg <= 5));

ALTER TABLE public.goal_presets
DROP CONSTRAINT IF EXISTS chk_goal_presets_fat_per_kg;
ALTER TABLE public.goal_presets
ADD CONSTRAINT chk_goal_presets_fat_per_kg
  CHECK (fat_per_kg IS NULL OR (fat_per_kg >= 0.1 AND fat_per_kg <= 3));

ALTER TABLE public.goal_presets
DROP CONSTRAINT IF EXISTS chk_goal_presets_macro_per_kg_basis;
ALTER TABLE public.goal_presets
ADD CONSTRAINT chk_goal_presets_macro_per_kg_basis
  CHECK (macro_per_kg_basis IN ('body_weight', 'lean_mass'));
