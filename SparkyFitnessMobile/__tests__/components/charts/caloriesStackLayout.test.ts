import {
  buildCaloriesStackDays,
  buildCaloriesBarLayout,
  type CaloriesStackDay,
} from '../../../src/components/charts/caloriesStackLayout';
import type { CaloriesDataPoint } from '../../../src/types/healthTrends';

const point = (overrides: Partial<CaloriesDataPoint>): CaloriesDataPoint => ({
  day: '2026-09-20',
  calories: 0,
  protein: 0,
  carbs: 0,
  fat: 0,
  ...overrides,
});

describe('buildCaloriesStackDays', () => {
  test('splits a day into protein/carbs/fat segments in the fixed carbs/fat/protein order', () => {
    // protein 20g*4=80, carbs 50g*4=200, fat 10g*9=90 -> 370, matching logged calories.
    const [day] = buildCaloriesStackDays([
      point({ protein: 20, carbs: 50, fat: 10, calories: 370 }),
    ]);

    expect(day.totalCalories).toBe(370);
    expect(day.segments).toEqual([
      { macro: 'carbs', calories: 200 },
      { macro: 'fat', calories: 90 },
      { macro: 'protein', calories: 80 },
    ]);
  });

  test('keeps the fixed carbs/fat/protein order regardless of which macro is largest', () => {
    const [day] = buildCaloriesStackDays([
      point({ protein: 100, carbs: 10, fat: 5, calories: 485 }),
    ]);

    expect(day.segments.map((segment) => segment.macro)).toEqual([
      'carbs',
      'fat',
      'protein',
    ]);
  });

  test('omits a macro with no calories rather than drawing a zero-height segment', () => {
    const [day] = buildCaloriesStackDays([
      point({ protein: 10, calories: 40 }),
    ]);

    expect(day.segments).toEqual([{ macro: 'protein', calories: 40 }]);
  });

  test("adds an `other` segment for calories the macros don't account for, at their true size", () => {
    // Macro grams only account for 200 kcal (protein 10g*4=40, carbs 40g*4=160), but the day
    // logged 300 -- e.g. alcohol, which this chart doesn't track by macro. The macro segments
    // keep their true gram-derived size; the other 100 kcal gets its own segment rather than
    // inflating carbs/protein to cover it.
    const [day] = buildCaloriesStackDays([
      point({ protein: 10, carbs: 40, calories: 300 }),
    ]);

    expect(day.totalCalories).toBe(300);
    expect(day.segments).toEqual([
      { macro: 'carbs', calories: 160 },
      { macro: 'protein', calories: 40 },
      { macro: 'other', calories: 100 },
    ]);
  });

  test('draws a single neutral `other` segment for calories logged with no macros', () => {
    const [day] = buildCaloriesStackDays([point({ calories: 120 })]);

    expect(day.totalCalories).toBe(120);
    expect(day.segments).toEqual([{ macro: 'other', calories: 120 }]);
  });

  test('draws no segments for a zero-calorie day', () => {
    const [day] = buildCaloriesStackDays([point({})]);

    expect(day.totalCalories).toBe(0);
    expect(day.segments).toEqual([]);
  });
});

describe('buildCaloriesBarLayout', () => {
  const days: CaloriesStackDay[] = [
    {
      day: '2026-09-19',
      totalCalories: 100,
      segments: [{ macro: 'protein', calories: 100 }],
    },
    {
      day: '2026-09-20',
      totalCalories: 50,
      segments: [{ macro: 'protein', calories: 50 }],
    },
  ];

  test('places one evenly spaced column per day', () => {
    const columns = buildCaloriesBarLayout(days, {
      width: 100,
      height: 50,
      innerPadding: 0.2,
      maxCalories: 100,
    });

    expect(columns).toHaveLength(2);
    expect(columns[0]).toMatchObject({ dayIndex: 0, x: 5, width: 40 });
    expect(columns[1]).toMatchObject({ dayIndex: 1, x: 55, width: 40 });
  });

  test('sizes a column proportional to its share of maxCalories', () => {
    const columns = buildCaloriesBarLayout(days, {
      width: 100,
      height: 50,
      innerPadding: 0.2,
      maxCalories: 100,
    });

    // Day 1 fills the whole plot height; day 2 (half the calories) fills half of it.
    expect(columns[0].blocks[0]).toEqual({
      y: 0,
      height: 50,
      macro: 'protein',
    });
    expect(columns[1].blocks[0]).toEqual({
      y: 25,
      height: 25,
      macro: 'protein',
    });
  });

  test('stacks multiple segments bottom-to-top in the order given', () => {
    const stackedDay: CaloriesStackDay = {
      day: '2026-09-21',
      totalCalories: 100,
      segments: [
        { macro: 'fat', calories: 60 },
        { macro: 'protein', calories: 40 },
      ],
    };

    const [column] = buildCaloriesBarLayout([stackedDay], {
      width: 10,
      height: 100,
      innerPadding: 0,
      maxCalories: 100,
    });

    expect(column.blocks).toEqual([
      { y: 40, height: 60, macro: 'fat' },
      { y: 0, height: 40, macro: 'protein' },
    ]);
  });

  test('returns no columns before layout is measured', () => {
    expect(
      buildCaloriesBarLayout(days, {
        width: 0,
        height: 50,
        innerPadding: 0.2,
        maxCalories: 100,
      })
    ).toEqual([]);
  });
});
