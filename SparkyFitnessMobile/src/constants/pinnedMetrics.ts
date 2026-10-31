/**
 * Everything the Pinned Metrics card can show, in factory order: the activity rings (a
 * value against its daily goal) and the health trends (a headline and sparkline).
 * Prefixed because `steps` is both a ring and a trend. Registering one here makes it
 * pickable in Pinned Metrics settings; a saved pick is reconciled against this list.
 */
export const PINNED_METRIC_KEYS = [
  'ring:move',
  'ring:exercise',
  'ring:steps',
  'ring:points',
  'trend:weight',
  'trend:sleep',
  'trend:heartRate',
  'trend:vo2max',
] as const;

export type PinnedMetricKey = (typeof PINNED_METRIC_KEYS)[number];

/** How many metrics the card can hold at once. */
export const MAX_PINNED_METRICS = 4;

export const DEFAULT_PINNED_METRICS: readonly PinnedMetricKey[] = [
  'ring:move',
  'ring:exercise',
  'trend:weight',
  'trend:sleep',
];
