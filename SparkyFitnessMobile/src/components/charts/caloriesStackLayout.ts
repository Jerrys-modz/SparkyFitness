import type { CaloriesDataPoint } from '../../types/healthTrends';

/**
 * The math behind the Dashboard calories trend's stacked bars.
 *
 * Split out from the chart for the same reason `sleepTimelineLayout.ts` is: Skia draws
 * nothing assertable under jsdom, so every number the chart needs is computed here where
 * it can be tested, and the component is left to measure, pick colours, and draw.
 */

export type CaloriesMacroKey = 'protein' | 'carbs' | 'fat';

export interface CaloriesStackSegment {
  macro: CaloriesMacroKey;
  calories: number;
}

export interface CaloriesStackDay {
  day: string;
  /** The sum of the three segments below -- what the bar actually draws, not the API's
   * `total_calories` (which can include alcohol and other calorie sources this chart
   * doesn't track). */
  totalCalories: number;
  /** In `SEGMENT_ORDER` (carbs, fat, protein); the layout stacks these bottom-to-top. */
  segments: CaloriesStackSegment[];
}

const CALORIES_PER_GRAM: Record<CaloriesMacroKey, number> = {
  protein: 4,
  carbs: 4,
  fat: 9,
};

/** Fixed stacking order, not sorted by size, so a macro's position is predictable day to day. */
const SEGMENT_ORDER: CaloriesMacroKey[] = ['carbs', 'fat', 'protein'];

/** Turns a day's protein/carbs/fat grams into calorie segments. */
export function buildCaloriesStackDays(
  points: CaloriesDataPoint[]
): CaloriesStackDay[] {
  return points.map((point) => {
    const caloriesByMacro: Record<CaloriesMacroKey, number> = {
      protein: point.protein * CALORIES_PER_GRAM.protein,
      carbs: point.carbs * CALORIES_PER_GRAM.carbs,
      fat: point.fat * CALORIES_PER_GRAM.fat,
    };

    const segments: CaloriesStackSegment[] = SEGMENT_ORDER.map((macro) => ({
      macro,
      calories: caloriesByMacro[macro],
    })).filter((segment) => segment.calories > 0);

    const totalCalories = segments.reduce((sum, s) => sum + s.calories, 0);

    return { day: point.day, totalCalories, segments };
  });
}

export interface CaloriesBarBlock {
  y: number;
  height: number;
  macro: CaloriesMacroKey;
}

export interface CaloriesBarColumn {
  dayIndex: number;
  x: number;
  width: number;
  blocks: CaloriesBarBlock[];
}

export interface CaloriesBarLayoutOptions {
  width: number;
  height: number;
  innerPadding: number;
  maxCalories: number;
}

/**
 * Lays the window's days out as evenly spaced columns, each day's segments stacked
 * bottom-to-top in the order given (`SEGMENT_ORDER`, from `buildCaloriesStackDays`).
 */
export function buildCaloriesBarLayout(
  days: CaloriesStackDay[],
  { width, height, innerPadding, maxCalories }: CaloriesBarLayoutOptions
): CaloriesBarColumn[] {
  if (width <= 0 || height <= 0 || days.length === 0 || maxCalories <= 0) {
    return [];
  }

  const slotWidth = width / days.length;
  const columnWidth = Math.max(1, slotWidth * (1 - innerPadding));
  const columnInset = (slotWidth - columnWidth) / 2;
  const toY = (calories: number) => (calories / maxCalories) * height;

  return days.map((day, dayIndex) => {
    let cumulative = 0;
    const blocks: CaloriesBarBlock[] = day.segments.map((segment) => {
      const bottomY = height - toY(cumulative);
      cumulative += segment.calories;
      const topY = height - toY(cumulative);
      return {
        y: topY,
        height: Math.max(0, bottomY - topY),
        macro: segment.macro,
      };
    });

    return {
      dayIndex,
      x: dayIndex * slotWidth + columnInset,
      width: columnWidth,
      blocks,
    };
  });
}
