/**
 * Everything the Pinned Metrics card can show, in factory order: the activity rings and the
 * nutrition and hydration goals (a value against its daily goal), and the health trends (a
 * headline and sparkline). Prefixed because `steps` is both a ring and a trend. Registering
 * one here makes it pickable in Pinned Metrics settings; a saved pick is reconciled
 * against this list.
 */
export const PINNED_METRIC_KEYS = [
  'ring:move',
  'ring:exercise',
  'ring:stand',
  'ring:steps',
  'ring:points',
  'goal:calories',
  'goal:protein',
  'goal:carbs',
  'goal:fat',
  'goal:water',
  'trend:weight',
  'trend:sleep',
  'trend:heartRate',
  'trend:vo2max',
  'trend:steps',
  'trend:hydration',
  'trend:calories',
] as const;

export type PinnedMetricKey = (typeof PINNED_METRIC_KEYS)[number];

/** The nutrition and hydration goals a tile can track (`goal:` keys above). */
export const GOAL_METRIC_KEYS = [
  'calories',
  'protein',
  'carbs',
  'fat',
  'water',
] as const;

export type GoalMetricKey = (typeof GOAL_METRIC_KEYS)[number];

type Translator = (key: string, options: { defaultValue: string }) => string;

export const GOAL_METRIC_LABELS: Record<
  GoalMetricKey,
  (t: Translator) => string
> = {
  calories: (t) => t('pinnedMetrics.calories', { defaultValue: 'Calories' }),
  protein: (t) => t('pinnedMetrics.protein', { defaultValue: 'Protein' }),
  carbs: (t) => t('pinnedMetrics.carbs', { defaultValue: 'Carbs' }),
  fat: (t) => t('pinnedMetrics.fat', { defaultValue: 'Fat' }),
  water: (t) => t('pinnedMetrics.water', { defaultValue: 'Water' }),
};

/** How many metrics the card can hold at once. */
export const MAX_PINNED_METRICS = 6;

export const DEFAULT_PINNED_METRICS: readonly PinnedMetricKey[] = [
  'ring:move',
  'ring:exercise',
  'trend:weight',
  'trend:sleep',
];
