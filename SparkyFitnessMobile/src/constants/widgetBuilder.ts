import type {
  WidgetAccent,
  WidgetFamily,
  WidgetMetric,
} from '@workspace/shared';

/** The named accents as colors, for the editor's swatches and the preview. */
export const WIDGET_ACCENT_COLORS: Record<WidgetAccent, string> = {
  blue: '#3b82f6',
  green: '#22c55e',
  orange: '#f97316',
  red: '#ef4444',
  purple: '#a855f7',
  teal: '#14b8a6',
  pink: '#ec4899',
  gray: '#9ca3af',
};

/** Approximate on-screen size (dp) of each family, for the preview. */
export const WIDGET_PREVIEW_SIZES: Record<
  WidgetFamily,
  { width: number; height: number }
> = {
  small: { width: 158, height: 158 },
  medium: { width: 338, height: 158 },
  large: { width: 338, height: 354 },
  lockCircular: { width: 76, height: 76 },
  lockRectangular: { width: 172, height: 76 },
  lockInline: { width: 240, height: 28 },
};

export interface WidgetPreviewSample {
  number: string;
  unit?: string;
  /** 0 to 1; absent for a figure with no goal. */
  progress?: number;
}

/**
 * Made-up figures the preview draws, so a layout can be judged before any
 * real data is involved. They are not formatted for the account's units.
 */
export const WIDGET_PREVIEW_SAMPLES: Record<WidgetMetric, WidgetPreviewSample> =
  {
    calories_remaining: { number: '820', unit: 'kcal', progress: 0.59 },
    calories_eaten: { number: '1,180', unit: 'kcal', progress: 0.59 },
    calories_burned: { number: '340', unit: 'kcal' },
    calorie_goal: { number: '2,000', unit: 'kcal' },
    protein: { number: '92', unit: 'g', progress: 0.57 },
    carbs: { number: '140', unit: 'g', progress: 0.5 },
    fat: { number: '48', unit: 'g', progress: 0.62 },
    water: { number: '1.4', unit: 'L', progress: 0.7 },
    weight: { number: '78.4', unit: 'kg' },
    steps: { number: '6,420', progress: 0.64 },
    sleep_duration: { number: '7h 20m' },
    resting_heart_rate: { number: '54', unit: 'bpm' },
    heart_rate: { number: '72', unit: 'bpm' },
    exercise_minutes: { number: '35', unit: 'min', progress: 0.7 },
    fasting_elapsed: { number: '12:40' },
    logging_streak: { number: '9' },
  };
