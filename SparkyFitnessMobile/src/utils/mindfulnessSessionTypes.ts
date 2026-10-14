import type { TFunction } from 'i18next';

/** The session types the log form offers, in the order its chips show them. */
export const MINDFULNESS_SESSION_TYPES = [
  'meditation',
  'breathwork',
  'reflection',
  'walking',
  'yoga',
  'guided',
  'unguided',
  'other',
] as const;

/**
 * Display name for a stored `session_type`. Anything the app does not offer
 * itself (a type written by another client or an import) reads as Other.
 */
export function mindfulnessSessionTypeLabel(
  type: string | null | undefined,
  t: TFunction
): string {
  switch (type) {
    case 'meditation':
      return t('mindfulness.types.meditation', { defaultValue: 'Meditation' });
    case 'breathwork':
      return t('mindfulness.types.breathwork', { defaultValue: 'Breathwork' });
    case 'reflection':
      return t('mindfulness.types.reflection', { defaultValue: 'Reflection' });
    case 'walking':
      return t('mindfulness.types.walking', {
        defaultValue: 'Mindful Walking',
      });
    case 'yoga':
      return t('mindfulness.types.yoga', { defaultValue: 'Yoga' });
    case 'guided':
      return t('mindfulness.types.guided', { defaultValue: 'Guided' });
    case 'unguided':
      return t('mindfulness.types.unguided', { defaultValue: 'Unguided' });
    default:
      return t('mindfulness.types.other', { defaultValue: 'Other' });
  }
}

/** The emoji shown beside a session type, with Other's for anything else. */
export function mindfulnessSessionTypeEmoji(
  type: string | null | undefined
): string {
  switch (type) {
    case 'meditation':
      return '🧘';
    case 'breathwork':
      return '🌊';
    case 'reflection':
      return '🪞';
    case 'walking':
      return '🚶';
    case 'yoga':
      return '🧘‍♀️';
    case 'guided':
      return '🎧';
    case 'unguided':
      return '🕯️';
    default:
      return '✨';
  }
}
