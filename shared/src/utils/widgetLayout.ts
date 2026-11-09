import { z } from 'zod';

/**
 * Custom widget layouts: the one contract the in-app widget builder, the
 * stored layout JSON and the native widget renderers (iOS WidgetKit today,
 * Android Glance later) all read. A layout says which numbers a widget shows
 * and how; the numbers themselves come from a separate snapshot keyed by
 * metric (`WidgetMetricValue`), so changing a layout never needs fresh data
 * and fresh data never rewrites a layout.
 *
 * Layouts are versioned. A reader must ignore what it does not know (an
 * unknown metric, style or family) instead of failing, because the widget
 * extension and the app update independently.
 */

export const WIDGET_LAYOUT_VERSION = 1;

/** Most layouts a person can save. Keeps the app-group payload small. */
export const MAX_WIDGET_LAYOUTS = 20;

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

/** Styles that make sense for a family. The first entry is the default. */
export const WIDGET_FAMILY_STYLES: Record<
  WidgetFamily,
  readonly WidgetStyle[]
> = {
  small: ['ring', 'value', 'bars'],
  medium: ['grid', 'bars', 'ring', 'list'],
  large: ['list', 'grid', 'bars'],
  lockCircular: ['ring', 'value'],
  lockRectangular: ['bars', 'list'],
  lockInline: ['value'],
};

export const widgetLayoutMetricSchema = z.object({
  metric: z.enum(WIDGET_METRICS),
  /** Overrides the metric's built-in label. User text, shown as typed. */
  label: z.string().trim().max(24).optional(),
});
export type WidgetLayoutMetric = z.infer<typeof widgetLayoutMetricSchema>;

export const widgetLayoutSchema = z.object({
  version: z.literal(WIDGET_LAYOUT_VERSION).default(WIDGET_LAYOUT_VERSION),
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(40),
  family: z.enum(WIDGET_FAMILIES),
  style: z.enum(WIDGET_STYLES),
  metrics: z.array(widgetLayoutMetricSchema).min(1).max(8),
  accent: z.enum(WIDGET_ACCENTS).default('blue'),
  showTitle: z.boolean().default(true),
  /** Larger type and no secondary text, for StandBy and across-the-room use. */
  standByFriendly: z.boolean().default(false),
  /** Epoch ms of the last edit. Widgets ignore it; the editor sorts by it. */
  updatedAt: z.number().int().nonnegative().default(0),
});
export type WidgetLayout = z.infer<typeof widgetLayoutSchema>;
export type WidgetLayoutInput = z.input<typeof widgetLayoutSchema>;

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
});
export type WidgetDataSnapshot = z.infer<typeof widgetDataSnapshotSchema>;

export function defaultStyleForFamily(family: WidgetFamily): WidgetStyle {
  return WIDGET_FAMILY_STYLES[family][0];
}

/**
 * Makes a layout safe to save and draw: styles the family cannot show fall
 * back to its default, repeated metrics are dropped, and the list is cut to
 * what the family fits. The editor calls this on every change so a person can
 * never save a layout the widget would have to truncate.
 */
export function normalizeWidgetLayout(layout: WidgetLayoutInput): WidgetLayout {
  const parsed = widgetLayoutSchema.parse(layout);
  const style = WIDGET_FAMILY_STYLES[parsed.family].includes(parsed.style)
    ? parsed.style
    : defaultStyleForFamily(parsed.family);

  const seen = new Set<WidgetMetric>();
  const metrics = parsed.metrics
    .filter(({ metric }) => {
      if (seen.has(metric)) return false;
      seen.add(metric);
      return true;
    })
    .slice(0, WIDGET_FAMILY_MAX_METRICS[parsed.family]);

  return { ...parsed, style, metrics };
}

/**
 * Reads stored layouts without letting one bad entry hide the rest. Entries
 * that fail to parse (a layout from a newer app, or a hand-edited one) are
 * dropped; the result never exceeds `MAX_WIDGET_LAYOUTS`.
 */
export function parseStoredWidgetLayouts(raw: unknown): WidgetLayout[] {
  if (!Array.isArray(raw)) return [];
  const layouts: WidgetLayout[] = [];
  for (const entry of raw) {
    const result = widgetLayoutSchema.safeParse(entry);
    if (result.success) layouts.push(normalizeWidgetLayout(result.data));
    if (layouts.length >= MAX_WIDGET_LAYOUTS) break;
  }
  return layouts;
}
