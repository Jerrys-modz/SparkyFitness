import type { ExpandedGoals } from '@/types/goals';
import type { Food } from '@/types/food';
import type { NutritionData } from '@/types/reports';
import {
  computeNutrientInsights,
  rankFoodSuggestions,
} from '@/utils/nutrientInsights';

const day = (date: string, values: Record<string, number>): NutritionData =>
  ({ date, calories: 2000, ...values }) as NutritionData;

const goalsFor = (
  dates: string[],
  values: Record<string, number>
): Record<string, ExpandedGoals> =>
  Object.fromEntries(dates.map((d) => [d, values as unknown as ExpandedGoals]));

const defaultGoalType = (key: string) =>
  key === 'sodium' || key === 'sugars' || key === 'saturated_fat'
    ? ('maximum' as const)
    : ('minimum' as const);

describe('computeNutrientInsights', () => {
  const D1 = '2026-10-01';
  const D2 = '2026-10-02';
  const dates = [D1, D2];

  it('flags shortfalls and excess against the goal direction', () => {
    const result = computeNutrientInsights({
      nutritionData: [
        day(D1, { iron: 4, sodium: 3000 }),
        day(D2, { iron: 6, sodium: 3000 }),
      ],
      goals: goalsFor(dates, { iron: 18, sodium: 2000 }),
      defaultGoalType,
    });
    const iron = result.insights.find((i) => i.key === 'iron');
    const sodium = result.insights.find((i) => i.key === 'sodium');
    expect(iron).toMatchObject({ average: 5, target: 18, status: 'deficient' });
    expect(sodium?.status).toBe('over');
    expect(result.loggedDays).toBe(2);
  });

  it('scores 100 when every nutrient meets its goal', () => {
    const result = computeNutrientInsights({
      nutritionData: [day(D1, { iron: 20, sodium: 1500 })],
      goals: goalsFor(dates, { iron: 18, sodium: 2000 }),
      defaultGoalType,
    });
    expect(result.nutritionScore).toBe(100);
  });

  it('penalises both shortfall and excess in the score', () => {
    const result = computeNutrientInsights({
      nutritionData: [day(D1, { iron: 9, sodium: 3000 })],
      goals: goalsFor(dates, { iron: 18, sodium: 2000 }),
      defaultGoalType,
    });
    // iron 0.5, sodium 2 - 1.5 = 0.5
    expect(result.nutritionScore).toBe(50);
  });

  it('skips nutrients without a goal and returns no score when nothing is measurable', () => {
    const result = computeNutrientInsights({
      nutritionData: [day(D1, { iron: 9 })],
      goals: goalsFor(dates, {}),
      defaultGoalType,
    });
    expect(result.insights).toEqual([]);
    expect(result.nutritionScore).toBeNull();
  });

  it('ignores days with no logged food', () => {
    const result = computeNutrientInsights({
      nutritionData: [
        day(D1, { iron: 18 }),
        { ...day(D2, { iron: 0 }), calories: 0 },
      ],
      goals: goalsFor(dates, { iron: 18 }),
      defaultGoalType,
    });
    expect(result.loggedDays).toBe(1);
    expect(result.insights[0]?.status).toBe('onTarget');
  });

  it('uses the target range for target-type goals and custom nutrients', () => {
    const result = computeNutrientInsights({
      nutritionData: [day(D1, { potassium: 5000, Magnesium: 100 })],
      goals: {
        [D1]: {
          potassium: 3500,
          custom_nutrients: { Magnesium: 400 },
        } as unknown as ExpandedGoals,
      },
      goalOverrides: {
        potassium: { goalType: 'target', targetMin: 3000, targetMax: 4000 },
      },
      defaultGoalType,
      customNutrientNames: ['Magnesium'],
    });
    expect(result.insights.find((i) => i.key === 'potassium')?.status).toBe(
      'over'
    );
    expect(result.insights.find((i) => i.key === 'Magnesium')?.status).toBe(
      'deficient'
    );
  });
});

describe('rankFoodSuggestions', () => {
  const food = (
    id: string,
    nutrients: Record<string, number>,
    custom?: Record<string, number>
  ): Food =>
    ({
      id,
      name: id,
      is_custom: true,
      default_variant: {
        serving_size: 100,
        serving_unit: 'g',
        calories: 100,
        protein: 0,
        carbs: 0,
        fat: 0,
        custom_nutrients: custom,
        ...nutrients,
      },
    }) as Food;

  const insights = computeNutrientInsights({
    nutritionData: [day('2026-10-01', { iron: 2, calcium: 600, sodium: 3000 })],
    goals: goalsFor(['2026-10-01'], { iron: 18, calcium: 1000, sodium: 2000 }),
    defaultGoalType,
  }).insights;

  it('ranks foods that cover the biggest gaps first and ignores excess nutrients', () => {
    const ranked = rankFoodSuggestions(
      [
        food('salty', { sodium: 900 }),
        food('beans', { iron: 8 }),
        food('liver', { iron: 16, calcium: 50 }),
      ],
      insights
    );
    expect(ranked.map((s) => s.food.id)).toEqual(['liver', 'beans']);
    expect(ranked[0]?.covers[0]?.key).toBe('iron');
  });

  it('suggests nothing when there are no gaps', () => {
    const none = computeNutrientInsights({
      nutritionData: [day('2026-10-01', { iron: 20 })],
      goals: goalsFor(['2026-10-01'], { iron: 18 }),
      defaultGoalType,
    }).insights;
    expect(rankFoodSuggestions([food('beans', { iron: 8 })], none)).toEqual([]);
  });

  it('reads custom nutrients and dedupes repeated foods', () => {
    const custom = computeNutrientInsights({
      nutritionData: [day('2026-10-01', { Magnesium: 50 })],
      goals: {
        '2026-10-01': {
          custom_nutrients: { Magnesium: 400 },
        } as unknown as ExpandedGoals,
      },
      defaultGoalType,
      customNutrientNames: ['Magnesium'],
    }).insights;
    const nuts = food('nuts', {}, { Magnesium: 120 });
    expect(rankFoodSuggestions([nuts, nuts], custom)).toHaveLength(1);
  });
});
