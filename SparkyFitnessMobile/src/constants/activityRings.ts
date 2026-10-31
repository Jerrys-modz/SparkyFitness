import { Platform } from 'react-native';

/** Stand hours come from Apple Health only; Android has no equivalent. */
export const STAND_HOURS_SUPPORTED = Platform.OS === 'ios';

/**
 * Every ring the Activity Rings card can draw, in factory order. Registering a ring here
 * makes it selectable in Activity Rings settings; each needs a label below.
 */
export const ACTIVITY_RING_KEYS = [
  'move',
  'exercise',
  'stand',
  'steps',
  'points',
] as const;

export type ActivityRingKey = (typeof ACTIVITY_RING_KEYS)[number];

/**
 * `apple` is Move, Exercise and Stand (no Stand off iOS); `google` is Exercise minutes and Active points;
 * `custom` draws the rings the user picked.
 * A style is a recipe over the same rings, so adding one later never needs new data.
 */
export const ACTIVITY_RING_STYLES = ['apple', 'google', 'custom'] as const;

export type ActivityRingStyle = (typeof ACTIVITY_RING_STYLES)[number];

export const APPLE_STYLE_RINGS: readonly ActivityRingKey[] = [
  'move',
  'exercise',
  'stand',
];

export const GOOGLE_STYLE_RINGS: readonly ActivityRingKey[] = [
  'exercise',
  'points',
];

type Translator = (key: string, options: { defaultValue: string }) => string;

export const ACTIVITY_RING_LABELS: Record<
  ActivityRingKey,
  (t: Translator) => string
> = {
  move: (t) => t('activityRings.move', { defaultValue: 'Move' }),
  exercise: (t) => t('activityRings.exercise', { defaultValue: 'Exercise' }),
  stand: (t) => t('activityRings.stand', { defaultValue: 'Stand' }),
  steps: (t) => t('activityRings.steps', { defaultValue: 'Steps' }),
  points: (t) => t('activityRings.points', { defaultValue: 'Active points' }),
};
