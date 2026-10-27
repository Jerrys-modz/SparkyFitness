import {
  KCAL_PER_GRAM_CARBS,
  buildFuelingEntryPayload,
  pickFuelingMealTypeId,
} from '../../src/utils/fuelingLog';
import type { MealType } from '../../src/types/mealTypes';

const mealType = (id: string, name: string, sort_order: number): MealType => ({
  id,
  name,
  sort_order,
  user_id: null,
  created_at: '2026-01-01T00:00:00Z',
  is_visible: true,
  show_in_quick_log: true,
  default_time: null,
});

describe('buildFuelingEntryPayload', () => {
  it('describes one portion as a standalone serving with its own carbs', () => {
    const payload = buildFuelingEntryPayload({
      productName: 'Energy gel',
      portionGrams: 25,
      mealTypeId: 'meal-1',
      entryDate: '2026-10-27',
      entryTime: '07:35',
    });

    expect(payload).toEqual({
      meal_type_id: 'meal-1',
      entry_date: '2026-10-27',
      entry_time: '07:35',
      quantity: 1,
      unit: 'serving',
      food_name: 'Energy gel',
      serving_size: 1,
      serving_unit: 'serving',
      carbs: 25,
      calories: 100,
      protein: 0,
      fat: 0,
    });
    expect(payload.food_id).toBeUndefined();
  });

  it('derives calories from the carbs', () => {
    const payload = buildFuelingEntryPayload({
      productName: 'Chews',
      portionGrams: 18,
      mealTypeId: 'm',
      entryDate: '2026-10-27',
      entryTime: '07:35',
    });
    expect(payload.calories).toBe(Math.round(18 * KCAL_PER_GRAM_CARBS));
  });
});

describe('pickFuelingMealTypeId', () => {
  it('prefers Snacks', () => {
    const types = [mealType('b', 'Breakfast', 1), mealType('s', 'Snacks', 4)];
    expect(pickFuelingMealTypeId(types)).toBe('s');
  });

  it('matches Snacks without regard to case', () => {
    expect(pickFuelingMealTypeId([mealType('s', ' snacks ', 4)])).toBe('s');
  });

  it('falls back to a meal for this time of day, then to nothing', () => {
    const types = [mealType('b', 'Breakfast', 1), mealType('l', 'Lunch', 2)];
    expect(types.map((t) => t.id)).toContain(pickFuelingMealTypeId(types));
    expect(pickFuelingMealTypeId([])).toBeNull();
  });
});
