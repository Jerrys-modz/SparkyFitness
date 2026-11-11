import type { TFunction } from 'i18next';
import type { BuiltinCoachKey, ChatToolCategorySlug } from '@workspace/shared';

/**
 * Names and one-line descriptions of the built-in coaches (#2013). Shared
 * exports only their ids and prompts; the wording people read lives here.
 */
export const BUILTIN_COACH_NAMES: Record<
  BuiltinCoachKey,
  (t: TFunction) => string
> = {
  recovery: (t) =>
    t('coaches.builtin.recovery.name', { defaultValue: 'Recovery Coach' }),
  consistency: (t) =>
    t('coaches.builtin.consistency.name', {
      defaultValue: 'Consistency Coach',
    }),
  macro_timing: (t) =>
    t('coaches.builtin.macro_timing.name', {
      defaultValue: 'Macro Timing Coach',
    }),
  sleep_recovery: (t) =>
    t('coaches.builtin.sleep_recovery.name', {
      defaultValue: 'Sleep and Recovery Coach',
    }),
};

export const BUILTIN_COACH_DESCRIPTIONS: Record<
  BuiltinCoachKey,
  (t: TFunction) => string
> = {
  recovery: (t) =>
    t('coaches.builtin.recovery.description', {
      defaultValue:
        'Connects your training with what you eat and how you rest.',
    }),
  consistency: (t) =>
    t('coaches.builtin.consistency.description', {
      defaultValue:
        'Helps you keep habits going and restart gently after a gap.',
    }),
  macro_timing: (t) =>
    t('coaches.builtin.macro_timing.description', {
      defaultValue:
        'Looks at when you eat protein and carbs around your workouts.',
    }),
  sleep_recovery: (t) =>
    t('coaches.builtin.sleep_recovery.description', {
      defaultValue: 'Compares your sleep with your training load.',
    }),
};

/** What each group of chat tools covers, for the coach editor. */
export const CHAT_TOOL_CATEGORY_LABELS: Record<
  ChatToolCategorySlug,
  (t: TFunction) => string
> = {
  food: (t) =>
    t('coaches.toolCategories.food', { defaultValue: 'Food & Water' }),
  exercise: (t) =>
    t('coaches.toolCategories.exercise', { defaultValue: 'Exercise' }),
  checkin: (t) =>
    t('coaches.toolCategories.checkin', { defaultValue: 'Body & Check-ins' }),
  goals: (t) => t('coaches.toolCategories.goals', { defaultValue: 'Goals' }),
  reports: (t) =>
    t('coaches.toolCategories.reports', {
      defaultValue: 'Reports & Analytics',
    }),
  coaching: (t) =>
    t('coaches.toolCategories.coaching', { defaultValue: 'Coaching' }),
  vision: (t) => t('coaches.toolCategories.vision', { defaultValue: 'Vision' }),
  profile: (t) =>
    t('coaches.toolCategories.profile', { defaultValue: 'Profile & Habits' }),
  medications: (t) =>
    t('coaches.toolCategories.medications', { defaultValue: 'Medications' }),
};
