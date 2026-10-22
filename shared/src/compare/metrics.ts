// The metrics Compare can pair, and how each one is measured. Apps translate the keys.

export type CompareMetricKind = 'continuous' | 'ordinal' | 'binary';
/** A day without a record: `event` is 0 after the first record, `food` is missing when nothing was logged, `plain` is missing. */
export type CompareMissingRule = 'event' | 'food' | 'plain';
export type CompareWeeklyRule = 'sum' | 'mean' | 'daysYes' | null; // null = not offered in week mode

export interface CompareMetricDef {
  key: CompareMetricKey;
  group: 'feelings' | 'sleep' | 'meditation' | 'food' | 'training' | 'body';
  kind: CompareMetricKind;
  unit: string;
  missing: CompareMissingRule;
  weekly: CompareWeeklyRule;
  /**
   * The value on a day is read over the 7 days ending on it (a trailing window), not from that
   * day alone, so a value above 0 does not mean the thing was done that day: a rolling habit has
   * no suggested start and no regularity in since mode.
   */
  rolling: boolean;
}

export const COMPARE_METRIC_KEYS = [
  'mood',
  'energy',
  'focus',
  'timeAsleep',
  'sleepScore',
  'overnightHrv',
  'restingHeartRate',
  'bedtime',
  'bedtimeConsistency',
  'meditationMinutes',
  'meditationSessions7d',
  'meditated',
  'calories',
  'protein',
  'carbs',
  'fat',
  'caffeine',
  'alcohol',
  'workoutMinutes',
  'cardioMinutes',
  'strengthVolume',
  'trainingLoad',
  'weightTrend',
  'steps',
] as const;

export type CompareMetricKey = (typeof COMPARE_METRIC_KEYS)[number];

type Rules = Partial<
  Pick<CompareMetricDef, 'kind' | 'missing' | 'weekly' | 'rolling'>
>;

/** A continuous, plain, day-by-day metric averaged per week unless `rules` says otherwise. */
function metric(
  key: CompareMetricKey,
  group: CompareMetricDef['group'],
  unit: string,
  rules: Rules = {}
): CompareMetricDef {
  return {
    key,
    group,
    kind: 'continuous',
    unit,
    missing: 'plain',
    weekly: 'mean',
    rolling: false,
    ...rules,
  };
}

const ORDINAL: Rules = { kind: 'ordinal' };
const EVENT: Rules = { missing: 'event', weekly: 'sum' };
const FOOD: Rules = { missing: 'food' };

export const COMPARE_METRICS: Record<CompareMetricKey, CompareMetricDef> = {
  mood: metric('mood', 'feelings', '10-100'),
  energy: metric('energy', 'feelings', '1-5', ORDINAL),
  focus: metric('focus', 'feelings', '1-5', ORDINAL),
  timeAsleep: metric('timeAsleep', 'sleep', 'h'),
  sleepScore: metric('sleepScore', 'sleep', 'score'),
  overnightHrv: metric('overnightHrv', 'sleep', 'ms'),
  restingHeartRate: metric('restingHeartRate', 'sleep', 'bpm'),
  bedtime: metric('bedtime', 'sleep', 'min-after-18:00'),
  bedtimeConsistency: metric('bedtimeConsistency', 'sleep', 'min', {
    rolling: true,
  }),
  meditationMinutes: metric('meditationMinutes', 'meditation', 'min', EVENT),
  meditationSessions7d: metric(
    'meditationSessions7d',
    'meditation',
    'sessions',
    { missing: 'event', weekly: null, rolling: true }
  ),
  meditated: metric('meditated', 'meditation', 'yes/no', {
    kind: 'binary',
    missing: 'event',
    weekly: 'daysYes',
  }),
  calories: metric('calories', 'food', 'kcal', FOOD),
  protein: metric('protein', 'food', 'g', FOOD),
  carbs: metric('carbs', 'food', 'g', FOOD),
  fat: metric('fat', 'food', 'g', FOOD),
  caffeine: metric('caffeine', 'food', 'mg', FOOD),
  alcohol: metric('alcohol', 'food', 'g', FOOD),
  workoutMinutes: metric('workoutMinutes', 'training', 'min', EVENT),
  cardioMinutes: metric('cardioMinutes', 'training', 'min', EVENT),
  strengthVolume: metric('strengthVolume', 'training', 'kg', EVENT),
  trainingLoad: metric('trainingLoad', 'training', 'points', EVENT),
  weightTrend: metric('weightTrend', 'body', 'kg'),
  steps: metric('steps', 'body', 'steps'),
};
