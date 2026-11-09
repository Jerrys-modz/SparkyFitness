import type { TFunction } from 'i18next';
import {
  WIDGET_FAMILY_MAX_METRICS,
  normalizeWidgetLayout,
  type WidgetAccent,
  type WidgetFamily,
  type WidgetLayout,
  type WidgetLayoutInput,
  type WidgetLayoutMetric,
  type WidgetMetric,
  type WidgetStyle,
} from '@workspace/shared';

/** What the editor holds while a widget is being built. */
export interface WidgetDraft {
  name: string;
  family: WidgetFamily;
  style: WidgetStyle;
  metrics: WidgetLayoutMetric[];
  accent: WidgetAccent;
  showTitle: boolean;
  standByFriendly: boolean;
}

export function emptyWidgetDraft(): WidgetDraft {
  return {
    name: '',
    family: 'small',
    style: 'ring',
    metrics: [{ metric: 'calories_remaining' }],
    accent: 'blue',
    showTitle: true,
    standByFriendly: false,
  };
}

export function draftFromLayout(layout: WidgetLayout): WidgetDraft {
  return {
    name: layout.name,
    family: layout.family,
    style: layout.style,
    metrics: layout.metrics,
    accent: layout.accent,
    showTitle: layout.showTitle,
    standByFriendly: layout.standByFriendly,
  };
}

/**
 * Makes the style and metric list fit the family, as the widget itself will
 * draw it. Runs after every edit so what the person sees is what is saved. A
 * blank name is fine here (it only has to be filled in to save).
 */
export function reconcileWidgetDraft(draft: WidgetDraft): WidgetDraft {
  if (draft.metrics.length === 0) return draft;
  const normalized = normalizeWidgetLayout({
    ...draft,
    id: 'draft',
    name: draft.name.trim() || 'Widget',
  });
  return { ...draft, style: normalized.style, metrics: normalized.metrics };
}

export function setDraftFamily(
  draft: WidgetDraft,
  family: WidgetFamily
): WidgetDraft {
  return reconcileWidgetDraft({ ...draft, family });
}

/**
 * Adds a metric, or removes it when it is already there. The last metric
 * cannot be removed and a full family cannot take another, so the list is
 * never empty and never longer than the widget can show.
 */
export function toggleDraftMetric(
  draft: WidgetDraft,
  metric: WidgetMetric
): WidgetDraft {
  if (draft.metrics.some((m) => m.metric === metric)) {
    if (draft.metrics.length <= 1) return draft;
    return {
      ...draft,
      metrics: draft.metrics.filter((m) => m.metric !== metric),
    };
  }
  if (draft.metrics.length >= WIDGET_FAMILY_MAX_METRICS[draft.family]) {
    return draft;
  }
  return { ...draft, metrics: [...draft.metrics, { metric }] };
}

export function draftToInput(
  draft: WidgetDraft
): Omit<WidgetLayoutInput, 'id'> {
  return { ...draft, name: draft.name.trim() };
}

export function draftIsValid(draft: WidgetDraft): boolean {
  return draft.name.trim().length > 0 && draft.metrics.length > 0;
}

// Labels. Each key is written out so the i18n audit can see it.

export function widgetMetricLabels(t: TFunction): Record<WidgetMetric, string> {
  return {
    calories_remaining: t('widgets.metrics.calories_remaining', {
      defaultValue: 'Calories left',
    }),
    calories_eaten: t('widgets.metrics.calories_eaten', {
      defaultValue: 'Calories eaten',
    }),
    calories_burned: t('widgets.metrics.calories_burned', {
      defaultValue: 'Calories burned',
    }),
    calorie_goal: t('widgets.metrics.calorie_goal', {
      defaultValue: 'Calorie goal',
    }),
    protein: t('widgets.metrics.protein', { defaultValue: 'Protein' }),
    carbs: t('widgets.metrics.carbs', { defaultValue: 'Carbs' }),
    fat: t('widgets.metrics.fat', { defaultValue: 'Fat' }),
    water: t('widgets.metrics.water', { defaultValue: 'Water' }),
    weight: t('widgets.metrics.weight', { defaultValue: 'Weight' }),
    steps: t('widgets.metrics.steps', { defaultValue: 'Steps' }),
    sleep_duration: t('widgets.metrics.sleep_duration', {
      defaultValue: 'Sleep',
    }),
    resting_heart_rate: t('widgets.metrics.resting_heart_rate', {
      defaultValue: 'Resting heart rate',
    }),
    heart_rate: t('widgets.metrics.heart_rate', {
      defaultValue: 'Average heart rate',
    }),
    exercise_minutes: t('widgets.metrics.exercise_minutes', {
      defaultValue: 'Exercise minutes',
    }),
    fasting_elapsed: t('widgets.metrics.fasting_elapsed', {
      defaultValue: 'Fasting timer',
    }),
    logging_streak: t('widgets.metrics.logging_streak', {
      defaultValue: 'Logging streak',
    }),
  };
}

export function widgetFamilyLabels(t: TFunction): Record<WidgetFamily, string> {
  return {
    small: t('widgets.families.small', { defaultValue: 'Small' }),
    medium: t('widgets.families.medium', { defaultValue: 'Medium' }),
    large: t('widgets.families.large', { defaultValue: 'Large' }),
    lockCircular: t('widgets.families.lockCircular', {
      defaultValue: 'Lock Screen circle',
    }),
    lockRectangular: t('widgets.families.lockRectangular', {
      defaultValue: 'Lock Screen rectangle',
    }),
    lockInline: t('widgets.families.lockInline', {
      defaultValue: 'Lock Screen line',
    }),
  };
}

export function widgetStyleLabels(t: TFunction): Record<WidgetStyle, string> {
  return {
    ring: t('widgets.styles.ring', { defaultValue: 'Ring' }),
    bars: t('widgets.styles.bars', { defaultValue: 'Bars' }),
    list: t('widgets.styles.list', { defaultValue: 'List' }),
    grid: t('widgets.styles.grid', { defaultValue: 'Grid' }),
    value: t('widgets.styles.value', { defaultValue: 'Big number' }),
  };
}

export function widgetAccentLabels(t: TFunction): Record<WidgetAccent, string> {
  return {
    blue: t('widgets.accents.blue', { defaultValue: 'Blue' }),
    green: t('widgets.accents.green', { defaultValue: 'Green' }),
    orange: t('widgets.accents.orange', { defaultValue: 'Orange' }),
    red: t('widgets.accents.red', { defaultValue: 'Red' }),
    purple: t('widgets.accents.purple', { defaultValue: 'Purple' }),
    teal: t('widgets.accents.teal', { defaultValue: 'Teal' }),
    pink: t('widgets.accents.pink', { defaultValue: 'Pink' }),
    gray: t('widgets.accents.gray', { defaultValue: 'Gray' }),
  };
}
