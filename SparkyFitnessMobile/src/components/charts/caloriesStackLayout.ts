import type { CaloriesDataPoint } from '../../types/healthTrends';

/**
 * The math behind the Dashboard calories trend's stacked bars.
 *
 * Split out from the chart for the same reason `sleepTimelineLayout.ts` is: Skia draws
 * nothing assertable under jsdom, so every number the chart needs is computed here where
 * it can be tested, and the component is left to measure, pick colours, and draw.
 */

/** `other` is the slice of a day's logged calories that protein/carbs/fat grams don't
 * account for -- alcohol, a calories-only quick add, or just fiber/rounding drift. Rather
 * than stretch the macro segments to cover it (which would misrepresent how much of each
 * macro was actually eaten), it gets its own neutral segment for the difference. */
export type CaloriesMacroKey = 'protein' | 'carbs' | 'fat' | 'other';

export interface CaloriesStackSegment {
  macro: CaloriesMacroKey;
  calories: number;
}

export interface CaloriesStackDay {
  day: string;
  /** The day's logged calories -- what the bar height and tooltip are driven by, matching
   * the Dashboard's "eaten" figure. The segments below are each macro's true gram-derived
   * calories, plus an `other` segment for whatever's left over, so they always sum to this
   * without inflating any one macro's true size. */
  totalCalories: number;
  /** In `MACRO_SEGMENT_ORDER` (carbs, fat, protein), then `other` last if there's a
   * leftover; the layout stacks these bottom-to-top. */
  segments: CaloriesStackSegment[];
}

const CALORIES_PER_GRAM: Record<'protein' | 'carbs' | 'fat', number> = {
  protein: 4,
  carbs: 4,
  fat: 9,
};

/** Below this, a macro/total mismatch reads as float noise, not a real leftover to draw. */
const LEFTOVER_ROUNDING_TOLERANCE = 0.5;

/** Fixed stacking order, not sorted by size, so a macro's position is predictable day to day. */
const MACRO_SEGMENT_ORDER: readonly ('protein' | 'carbs' | 'fat')[] = [
  'carbs',
  'fat',
  'protein',
];

/**
 * Turns a day's logged calories into stacked segments: each macro at its true gram-derived
 * size, plus an `other` segment for any calories they don't account for -- never scaled up
 * to cover it, which would draw more of a macro than was actually eaten. The segments' sum
 * always equals the day's logged calories, which is also the bar height and tooltip total,
 * matching the Dashboard's "eaten" figure and keeping the goal-line comparison honest.
 */
export function buildCaloriesStackDays(
  points: CaloriesDataPoint[]
): CaloriesStackDay[] {
  return points.map((point) => {
    const totalCalories = Math.max(0, point.calories);

    const caloriesByMacro: Record<'protein' | 'carbs' | 'fat', number> = {
      protein: Math.max(0, point.protein) * CALORIES_PER_GRAM.protein,
      carbs: Math.max(0, point.carbs) * CALORIES_PER_GRAM.carbs,
      fat: Math.max(0, point.fat) * CALORIES_PER_GRAM.fat,
    };
    const macroCalories =
      caloriesByMacro.protein + caloriesByMacro.carbs + caloriesByMacro.fat;

    const segments: CaloriesStackSegment[] = MACRO_SEGMENT_ORDER.map(
      (macro) => ({
        macro,
        calories: caloriesByMacro[macro],
      })
    ).filter((segment) => segment.calories > 0);

    // Never negative: an overshoot only happens from float rounding in the grams -> calories
    // conversion, not a real skew, since macros are components of the logged total. The
    // tolerance keeps that same float noise from the other direction manifesting as an
    // invisible sub-calorie `other` sliver (and a stray legend dot for it) on a day whose
    // macros genuinely do account for the full total.
    const leftover = totalCalories - macroCalories;
    if (leftover > LEFTOVER_ROUNDING_TOLERANCE) {
      segments.push({ macro: 'other', calories: leftover });
    }

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
 * bottom-to-top in the order given (see `CaloriesStackDay.segments`, from `buildCaloriesStackDays`).
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
