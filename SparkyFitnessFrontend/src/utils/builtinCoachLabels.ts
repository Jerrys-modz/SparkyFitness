import type { BuiltinCoachKey } from '@workspace/shared';

/**
 * Translation key and English fallback for each built-in coach's name and
 * one-line description. Shared exports only ids and prompts; apps own the
 * wording people read.
 */
export const BUILTIN_COACH_LABELS: Record<
  BuiltinCoachKey,
  { name: [string, string]; description: [string, string] }
> = {
  recovery: {
    name: ['coaches.builtin.recovery.name', 'Recovery Coach'],
    description: [
      'coaches.builtin.recovery.description',
      'Connects your training with what you eat and how you rest.',
    ],
  },
  consistency: {
    name: ['coaches.builtin.consistency.name', 'Consistency Coach'],
    description: [
      'coaches.builtin.consistency.description',
      'Helps you keep habits going and restart gently after a gap.',
    ],
  },
  macro_timing: {
    name: ['coaches.builtin.macro_timing.name', 'Macro Timing Coach'],
    description: [
      'coaches.builtin.macro_timing.description',
      'Looks at when you eat protein and carbs around your workouts.',
    ],
  },
  sleep_recovery: {
    name: ['coaches.builtin.sleep_recovery.name', 'Sleep and Recovery Coach'],
    description: [
      'coaches.builtin.sleep_recovery.description',
      'Compares your sleep with your training load.',
    ],
  },
};
