-- Weekly calorie budget: an opt-in mode that carries the calories a person ate
-- above or below their targets earlier in the week forward over the days left.
-- The week's budget is the sum of that week's daily targets; each remaining
-- day's target moves by (allowance so far - eaten so far) / days left, capped
-- at `weekly_calorie_budget_max_shift_percent` of the day's own target and
-- never below the safety floor. The maths is the shared
-- `weeklyBudgetDayTarget` (shared/src/utils/weeklyCalorieBudget.ts). Off by
-- default, so nobody's targets change until they turn it on.

ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS weekly_calorie_budget_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.user_preferences
ADD COLUMN IF NOT EXISTS weekly_calorie_budget_max_shift_percent SMALLINT NOT NULL DEFAULT 20;

ALTER TABLE public.user_preferences
DROP CONSTRAINT IF EXISTS chk_weekly_calorie_budget_max_shift_percent;
ALTER TABLE public.user_preferences
ADD CONSTRAINT chk_weekly_calorie_budget_max_shift_percent
  CHECK (weekly_calorie_budget_max_shift_percent BETWEEN 5 AND 50);

-- A past day's target uses the budget settings in force on that day (#1795),
-- including where its week started. Days recorded before this migration
-- predate the feature and stay off.
ALTER TABLE public.user_calorie_rule_history
ADD COLUMN IF NOT EXISTS weekly_calorie_budget_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.user_calorie_rule_history
ADD COLUMN IF NOT EXISTS weekly_calorie_budget_max_shift_percent SMALLINT NOT NULL DEFAULT 20;

ALTER TABLE public.user_calorie_rule_history
ADD COLUMN IF NOT EXISTS first_day_of_week SMALLINT;

-- Existing history rows take the account's current first day of the week, so
-- recording the week start does not regroup any week. Guarded, so a re-run
-- leaves rows written since alone.
UPDATE public.user_calorie_rule_history h
   SET first_day_of_week = p.first_day_of_week
  FROM public.user_preferences p
 WHERE p.user_id = h.user_id
   AND h.first_day_of_week IS NULL
   AND p.first_day_of_week IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_calorie_rule_change() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  zone TEXT;
  prior_preferences public.user_preferences%ROWTYPE;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Recreated preferences must replace the latest recorded settings. An
    -- initially enabled opt-in also needs an off baseline for past days.
    IF NOT NEW.adjust_macros_with_exercise
       AND NEW.calorie_cycling_mode = 'off'
       AND NOT NEW.weekly_calorie_budget_enabled
       AND NOT EXISTS (
         SELECT 1 FROM public.user_calorie_rule_history WHERE user_id = NEW.user_id
       ) THEN
      RETURN NULL;
    END IF;
    prior_preferences := NEW;
    prior_preferences.adjust_macros_with_exercise := FALSE;
    prior_preferences.calorie_cycling_mode := 'off';
    prior_preferences.calorie_cycling_offsets := '{0,0,0,0,0,0,0}';
    prior_preferences.weekly_calorie_budget_enabled := FALSE;
  ELSE
    prior_preferences := OLD;
  END IF;

  -- Keep the rules before the first change. Even an initially enabled opt-in
  -- starts today; it must not change targets for earlier diary dates.
  INSERT INTO public.user_calorie_rule_history (
      user_id, effective_date,
      goal_mode, goal_mode_calculation_method, goal_mode_custom_percentage,
      goal_mode_weekly_change_kg, calorie_goal_adjustment_mode, exercise_calorie_percentage,
      tdee_allow_negative_adjustment, calorie_safety_floor_mode,
      calorie_safety_floor_value, adaptive_activity_separate, bmr_algorithm,
      activity_level, use_external_bmr, include_bmr_in_net_calories, adjust_macros_with_exercise,
      calorie_cycling_mode, calorie_cycling_offsets,
      weekly_calorie_budget_enabled, weekly_calorie_budget_max_shift_percent, first_day_of_week
    )
    SELECT
      prior_preferences.user_id, '-infinity',
      prior_preferences.goal_mode, prior_preferences.goal_mode_calculation_method, prior_preferences.goal_mode_custom_percentage,
      prior_preferences.goal_mode_weekly_change_kg, prior_preferences.calorie_goal_adjustment_mode, prior_preferences.exercise_calorie_percentage,
      prior_preferences.tdee_allow_negative_adjustment, prior_preferences.calorie_safety_floor_mode,
      prior_preferences.calorie_safety_floor_value, prior_preferences.adaptive_activity_separate, prior_preferences.bmr_algorithm,
      prior_preferences.activity_level, prior_preferences.use_external_bmr, prior_preferences.include_bmr_in_net_calories, prior_preferences.adjust_macros_with_exercise,
      prior_preferences.calorie_cycling_mode, prior_preferences.calorie_cycling_offsets,
      prior_preferences.weekly_calorie_budget_enabled, prior_preferences.weekly_calorie_budget_max_shift_percent, prior_preferences.first_day_of_week
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_calorie_rule_history WHERE user_id = prior_preferences.user_id
    );

  -- An unknown zone would make AT TIME ZONE fail the whole preference update.
  -- Case-insensitive, because the server accepts any casing Intl accepts.
  zone := COALESCE(
    (SELECT name FROM pg_timezone_names
     WHERE lower(name) = lower(NEW.timezone) LIMIT 1),
    'UTC'
  );

  -- A change applies from today in the user's zone; a second change on the
  -- same day replaces the first.
  INSERT INTO public.user_calorie_rule_history (
    user_id, effective_date,
    goal_mode, goal_mode_calculation_method, goal_mode_custom_percentage,
    goal_mode_weekly_change_kg, calorie_goal_adjustment_mode, exercise_calorie_percentage,
    tdee_allow_negative_adjustment, calorie_safety_floor_mode,
    calorie_safety_floor_value, adaptive_activity_separate, bmr_algorithm,
    activity_level, use_external_bmr, include_bmr_in_net_calories, adjust_macros_with_exercise,
    calorie_cycling_mode, calorie_cycling_offsets,
    weekly_calorie_budget_enabled, weekly_calorie_budget_max_shift_percent, first_day_of_week
  )
  VALUES (
    NEW.user_id, (now() AT TIME ZONE zone)::date,
    NEW.goal_mode, NEW.goal_mode_calculation_method, NEW.goal_mode_custom_percentage,
    NEW.goal_mode_weekly_change_kg, NEW.calorie_goal_adjustment_mode, NEW.exercise_calorie_percentage,
    NEW.tdee_allow_negative_adjustment, NEW.calorie_safety_floor_mode,
    NEW.calorie_safety_floor_value, NEW.adaptive_activity_separate, NEW.bmr_algorithm,
    NEW.activity_level, NEW.use_external_bmr, NEW.include_bmr_in_net_calories, NEW.adjust_macros_with_exercise,
    NEW.calorie_cycling_mode, NEW.calorie_cycling_offsets,
    NEW.weekly_calorie_budget_enabled, NEW.weekly_calorie_budget_max_shift_percent, NEW.first_day_of_week
  )
  ON CONFLICT (user_id, effective_date) DO UPDATE SET
    goal_mode = EXCLUDED.goal_mode,
    goal_mode_calculation_method = EXCLUDED.goal_mode_calculation_method,
    goal_mode_custom_percentage = EXCLUDED.goal_mode_custom_percentage,
    goal_mode_weekly_change_kg = EXCLUDED.goal_mode_weekly_change_kg,
    calorie_goal_adjustment_mode = EXCLUDED.calorie_goal_adjustment_mode,
    exercise_calorie_percentage = EXCLUDED.exercise_calorie_percentage,
    tdee_allow_negative_adjustment = EXCLUDED.tdee_allow_negative_adjustment,
    calorie_safety_floor_mode = EXCLUDED.calorie_safety_floor_mode,
    calorie_safety_floor_value = EXCLUDED.calorie_safety_floor_value,
    adaptive_activity_separate = EXCLUDED.adaptive_activity_separate,
    bmr_algorithm = EXCLUDED.bmr_algorithm,
    activity_level = EXCLUDED.activity_level,
    use_external_bmr = EXCLUDED.use_external_bmr,
    include_bmr_in_net_calories = EXCLUDED.include_bmr_in_net_calories,
    adjust_macros_with_exercise = EXCLUDED.adjust_macros_with_exercise,
    calorie_cycling_mode = EXCLUDED.calorie_cycling_mode,
    calorie_cycling_offsets = EXCLUDED.calorie_cycling_offsets,
    weekly_calorie_budget_enabled = EXCLUDED.weekly_calorie_budget_enabled,
    weekly_calorie_budget_max_shift_percent = EXCLUDED.weekly_calorie_budget_max_shift_percent,
    first_day_of_week = EXCLUDED.first_day_of_week,
    updated_at = now();

  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS record_calorie_rule_change ON public.user_preferences;
CREATE TRIGGER record_calorie_rule_change
    AFTER UPDATE ON public.user_preferences
    FOR EACH ROW
    WHEN (
      ROW(
        OLD.goal_mode, OLD.goal_mode_calculation_method, OLD.goal_mode_custom_percentage,
        OLD.goal_mode_weekly_change_kg, OLD.calorie_goal_adjustment_mode, OLD.exercise_calorie_percentage,
        OLD.tdee_allow_negative_adjustment, OLD.calorie_safety_floor_mode,
        OLD.calorie_safety_floor_value, OLD.adaptive_activity_separate, OLD.bmr_algorithm,
        OLD.activity_level, OLD.use_external_bmr, OLD.include_bmr_in_net_calories, OLD.adjust_macros_with_exercise,
        OLD.calorie_cycling_mode, OLD.calorie_cycling_offsets,
        OLD.weekly_calorie_budget_enabled, OLD.weekly_calorie_budget_max_shift_percent, OLD.first_day_of_week
      ) IS DISTINCT FROM ROW(
        NEW.goal_mode, NEW.goal_mode_calculation_method, NEW.goal_mode_custom_percentage,
        NEW.goal_mode_weekly_change_kg, NEW.calorie_goal_adjustment_mode, NEW.exercise_calorie_percentage,
        NEW.tdee_allow_negative_adjustment, NEW.calorie_safety_floor_mode,
        NEW.calorie_safety_floor_value, NEW.adaptive_activity_separate, NEW.bmr_algorithm,
        NEW.activity_level, NEW.use_external_bmr, NEW.include_bmr_in_net_calories, NEW.adjust_macros_with_exercise,
        NEW.calorie_cycling_mode, NEW.calorie_cycling_offsets,
        NEW.weekly_calorie_budget_enabled, NEW.weekly_calorie_budget_max_shift_percent, NEW.first_day_of_week
      )
    )
    EXECUTE FUNCTION public.record_calorie_rule_change();

DROP TRIGGER IF EXISTS record_calorie_rule_change_on_insert ON public.user_preferences;
CREATE TRIGGER record_calorie_rule_change_on_insert
    AFTER INSERT ON public.user_preferences
    FOR EACH ROW
    EXECUTE FUNCTION public.record_calorie_rule_change();
