import type {
  WidgetAccent,
  WidgetFamily,
  WidgetMetric,
  WidgetStyle,
} from '@workspace/shared';

/**
 * The `global.css` color token each widget accent is drawn with in the app
 * (the editor's swatches and the preview). The first seven are the Category
 * palette, DESIGN.md's colors for "things that need a distinct color but no
 * fixed meaning". There is no red in that palette, so red uses Heart-Rate Red.
 * The real widget draws the matching system colors; these only approximate
 * them, in whichever theme the app is in.
 */
export const WIDGET_ACCENT_TOKENS: Record<WidgetAccent, string> = {
  blue: '--color-cat-blue',
  green: '--color-cat-green',
  orange: '--color-cat-orange',
  red: '--color-heart-rate',
  purple: '--color-cat-violet',
  teal: '--color-cat-teal',
  pink: '--color-cat-pink',
  gray: '--color-cat-slate',
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
    water: { number: '1,400', unit: 'ml', progress: 0.7 },
    weight: { number: '78.4', unit: 'kg' },
    steps: { number: '6,420', progress: 0.64 },
    sleep_duration: { number: '7h 20m' },
    resting_heart_rate: { number: '54', unit: 'bpm' },
    heart_rate: { number: '72', unit: 'bpm' },
    exercise_minutes: { number: '35', unit: 'min', progress: 0.7 },
    fasting_elapsed: { number: '12:40' },
    logging_streak: { number: '9' },
  };

export type WidgetTemplateKey =
  | 'caloriesLeft'
  | 'macros'
  | 'dailySummary'
  | 'hydration'
  | 'fasting'
  | 'activity'
  | 'lockCalories'
  | 'lockGlance';

export interface WidgetTemplate {
  key: WidgetTemplateKey;
  family: WidgetFamily;
  style: WidgetStyle;
  metrics: readonly WidgetMetric[];
  accent: WidgetAccent;
}

/**
 * Starting points for a new widget. Each must already be valid for its family
 * (style allowed, metric count within the limit); a test runs every one
 * through `normalizeWidgetLayout`.
 */
export const WIDGET_TEMPLATES: readonly WidgetTemplate[] = [
  {
    key: 'caloriesLeft',
    family: 'small',
    style: 'ring',
    metrics: ['calories_remaining'],
    accent: 'orange',
  },
  {
    key: 'macros',
    family: 'medium',
    style: 'bars',
    metrics: ['protein', 'carbs', 'fat'],
    accent: 'blue',
  },
  {
    key: 'dailySummary',
    family: 'large',
    style: 'list',
    metrics: [
      'calories_remaining',
      'protein',
      'carbs',
      'fat',
      'water',
      'steps',
      'sleep_duration',
      'weight',
    ],
    accent: 'green',
  },
  {
    key: 'hydration',
    family: 'small',
    style: 'ring',
    metrics: ['water'],
    accent: 'teal',
  },
  {
    key: 'fasting',
    family: 'small',
    style: 'value',
    metrics: ['fasting_elapsed'],
    accent: 'purple',
  },
  {
    key: 'activity',
    family: 'medium',
    style: 'grid',
    metrics: ['steps', 'exercise_minutes', 'calories_burned', 'sleep_duration'],
    accent: 'red',
  },
  {
    key: 'lockCalories',
    family: 'lockCircular',
    style: 'ring',
    metrics: ['calories_remaining'],
    accent: 'orange',
  },
  {
    key: 'lockGlance',
    family: 'lockRectangular',
    style: 'bars',
    metrics: ['calories_remaining', 'protein', 'water'],
    accent: 'blue',
  },
];
