import { z } from 'zod';

/**
 * Custom widget contract: the numbers the app writes for the iOS custom widget
 * (and a future Android one) and the tables its renderers mirror. The person
 * picks what each widget shows in the widget's own Edit Widget screen, so
 * nothing here describes a saved layout; the app only supplies the day's
 * figures for every metric (`WidgetDataSnapshot`).
 *
 * A reader must ignore what it does not know (an unknown metric or style),
 * because the widget extension and the app update independently.
 */

/** Every number a custom widget can show. Values are produced by the app. */
export const WIDGET_METRICS = [
  'calories_remaining',
  'calories_eaten',
  'calories_burned',
  'calorie_goal',
  'protein',
  'carbs',
  'fat',
  'water',
  'weight',
  'steps',
  'sleep_duration',
  'resting_heart_rate',
  'heart_rate',
  'exercise_minutes',
  'fasting_elapsed',
  'logging_streak',
] as const;
export type WidgetMetric = (typeof WIDGET_METRICS)[number];

/**
 * Where a widget can sit. `small` is also what StandBy draws, so a layout in
 * that family should read from across a room (see `standByFriendly`).
 */
export const WIDGET_FAMILIES = [
  'small',
  'medium',
  'large',
  'lockCircular',
  'lockRectangular',
  'lockInline',
] as const;
export type WidgetFamily = (typeof WIDGET_FAMILIES)[number];

export const WIDGET_STYLES = ['ring', 'bars', 'list', 'grid', 'value'] as const;
export type WidgetStyle = (typeof WIDGET_STYLES)[number];

/** Accent colors are named, not hex, so each theme and tint mode can map them. */
export const WIDGET_ACCENTS = [
  'blue',
  'green',
  'orange',
  'red',
  'purple',
  'teal',
  'pink',
  'gray',
] as const;
export type WidgetAccent = (typeof WIDGET_ACCENTS)[number];

/** How many metrics each family can show legibly. */
export const WIDGET_FAMILY_MAX_METRICS: Record<WidgetFamily, number> = {
  small: 2,
  medium: 4,
  large: 8,
  lockCircular: 1,
  lockRectangular: 3,
  lockInline: 1,
};

/**
 * Styles that make sense for a family. The first entry is the default, so
 * every family lists at least one (the type says so, which keeps `[0]` defined
 * under `noUncheckedIndexedAccess`, as the web app compiles it).
 */
export const WIDGET_FAMILY_STYLES: Record<
  WidgetFamily,
  readonly [WidgetStyle, ...WidgetStyle[]]
> = {
  small: ['ring', 'value', 'bars'],
  medium: ['grid', 'bars', 'ring', 'list'],
  large: ['list', 'grid', 'bars'],
  lockCircular: ['ring', 'value'],
  lockRectangular: ['bars', 'list'],
  lockInline: ['value'],
};

/**
 * Where tapping a number opens the app: a path under the app's link scheme
 * (`sparkyfitnessmobile://<path>`), each one a screen that needs no params.
 * The app sends these in the snapshot, so the widget never repeats the table;
 * every path must be registered in the mobile app's linking config (a test
 * checks it).
 */
export const WIDGET_METRIC_LINK_PATHS: Record<WidgetMetric, string> = {
  calories_remaining: 'diary',
  calories_eaten: 'diary',
  calories_burned: 'diary',
  calorie_goal: 'diary',
  protein: 'reports/nutrition',
  carbs: 'reports/nutrition',
  fat: 'reports/nutrition',
  water: 'reports/hydration',
  weight: 'reports/measurements',
  steps: 'reports/measurements',
  sleep_duration: 'reports/sleep',
  resting_heart_rate: 'reports/heart-rate',
  heart_rate: 'reports/heart-rate',
  exercise_minutes: 'exercise-statistics',
  fasting_elapsed: 'fasting',
  logging_streak: 'reports/nutrition',
};

/**
 * One metric's current value, as the app writes it for the widget. Numbers
 * only (the iOS app-group bridge stores strings and numbers), already in the
 * unit named by `unit`. `goal` and `progress` are optional: a metric with no
 * target (weight, heart rate) has neither.
 */
export const widgetMetricValueSchema = z.object({
  value: z.number(),
  goal: z.number().optional(),
  /** 0 to 1. Absent when there is no goal to measure against. */
  progress: z.number().min(0).max(1).optional(),
  unit: z.string().max(12),
});
export type WidgetMetricValue = z.infer<typeof widgetMetricValueSchema>;

export const widgetDataSnapshotSchema = z.object({
  /** Calendar day the numbers are for, YYYY-MM-DD in the person's timezone. */
  date: z.string(),
  lastUpdated: z.number(),
  /**
   * Energy metrics (unit `energy`) are always sent in kcal; the widget converts
   * them to this unit for display. A snapshot without it is kcal.
   */
  energyUnit: z.enum(['kcal', 'kJ']).optional(),
  /**
   * Keyed by `WidgetMetric`. A metric with no value today is left out, so the
   * widget shows its empty state instead of a false zero. `fasting_elapsed`
   * is the exception to "value is the figure": its value is the fast's start
   * in epoch seconds and its unit is `since`, so the widget can run the clock
   * itself between refreshes.
   */
  metrics: z.record(z.string(), widgetMetricValueSchema),
  /**
   * `WIDGET_METRIC_LINK_PATHS`, keyed by metric. Absent from a snapshot
   * written by an older app, in which case a tap opens the app.
   */
  links: z.record(z.string(), z.string()).optional(),
});
export type WidgetDataSnapshot = z.infer<typeof widgetDataSnapshotSchema>;
