-- Per-exercise progressive overload settings stored on the preset template.
-- Suggestions are computed at session start on the client; GET presets return
-- these values unchanged.
ALTER TABLE workout_preset_exercises
  ADD COLUMN IF NOT EXISTS progression_mode varchar(30) NOT NULL DEFAULT 'rep_goal',
  ADD COLUMN IF NOT EXISTS rep_goal integer DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS increment_type varchar(20) NOT NULL DEFAULT 'weight',
  ADD COLUMN IF NOT EXISTS increment_value numeric(6, 2) NOT NULL DEFAULT 5.0,
  ADD COLUMN IF NOT EXISTS equipment_brand varchar(100) DEFAULT NULL;

ALTER TABLE workout_preset_exercises
  DROP CONSTRAINT IF EXISTS workout_preset_exercises_progression_mode_check,
  DROP CONSTRAINT IF EXISTS workout_preset_exercises_increment_type_check,
  DROP CONSTRAINT IF EXISTS workout_preset_exercises_rep_goal_check,
  DROP CONSTRAINT IF EXISTS workout_preset_exercises_increment_value_check;

ALTER TABLE workout_preset_exercises
  ADD CONSTRAINT workout_preset_exercises_progression_mode_check
    CHECK (progression_mode IN ('rep_goal', 'fixed', 'step_load', 'manual')),
  ADD CONSTRAINT workout_preset_exercises_increment_type_check
    CHECK (increment_type IN ('weight', 'reps')),
  ADD CONSTRAINT workout_preset_exercises_rep_goal_check
    CHECK (rep_goal IS NULL OR rep_goal > 0),
  ADD CONSTRAINT workout_preset_exercises_increment_value_check
    CHECK (increment_value > 0);
