-- Weekly weight coaching: the person's goal direction, rate and check-in day.
-- Stored beside the other goal preferences; the proposals themselves are
-- derived on request and accepted through the goals timeline, so nothing else
-- is persisted. user_preferences keeps its existing owner policies.
ALTER TABLE public.user_preferences
  ADD COLUMN coaching_goal_direction TEXT NOT NULL DEFAULT 'maintain',
  ADD COLUMN coaching_rate_kg_per_week NUMERIC(3, 2) NOT NULL DEFAULT 0.25,
  ADD COLUMN coaching_check_in_weekday SMALLINT NOT NULL DEFAULT 0,
  ADD CONSTRAINT user_preferences_coaching_goal_direction_check
    CHECK (coaching_goal_direction IN ('lose', 'maintain', 'gain')),
  ADD CONSTRAINT user_preferences_coaching_rate_check
    CHECK (coaching_rate_kg_per_week BETWEEN 0 AND 1),
  ADD CONSTRAINT user_preferences_coaching_check_in_weekday_check
    CHECK (coaching_check_in_weekday BETWEEN 0 AND 6);

COMMENT ON COLUMN public.user_preferences.coaching_goal_direction IS
  'Weight coaching goal: lose, maintain or gain.';
COMMENT ON COLUMN public.user_preferences.coaching_rate_kg_per_week IS
  'Weight change per week, in kg, the coaching check-in aims for (direction gives the sign).';
COMMENT ON COLUMN public.user_preferences.coaching_check_in_weekday IS
  'Weekday of the weekly coaching check-in, 0 = Sunday to 6 = Saturday.';
