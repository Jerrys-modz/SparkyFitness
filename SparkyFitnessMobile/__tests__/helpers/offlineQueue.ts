import type {
  CheckInQueueItem,
  FoodEntryQueueItem,
  QueueItem,
  WaterQueueItem,
} from '../../src/services/offlineQueue/types';
import type { FoodEntry } from '../../src/types/foodEntries';

const base = (id: string, createdAt: string) => ({
  id,
  configId: 'config-1',
  accountId: null,
  entryDate: '2026-10-17',
  createdAt,
  attempts: 0,
  nextAttemptAt: 0,
});

export const foodPreview = (id: string, calories = 100): FoodEntry => ({
  id: `pending:${id}`,
  food_id: 'food-1',
  variant_id: 'variant-1',
  meal_type: 'Breakfast',
  meal_type_id: 'meal-type-1',
  quantity: 1,
  unit: 'g',
  entry_date: '2026-10-17',
  food_name: 'Oats',
  serving_size: 1,
  calories,
});

export const foodItem = (
  id: string,
  createdAt = '2026-10-17T08:00:00.000Z',
  overrides: Partial<QueueItem> = {}
): FoodEntryQueueItem => ({
  ...base(id, createdAt),
  kind: 'food_entry',
  payload: {
    meal_type_id: 'meal-type-1',
    quantity: 1,
    unit: 'g',
    entry_date: '2026-10-17',
    food_id: 'food-1',
    variant_id: 'variant-1',
  },
  preview: foodPreview(id),
  ...(overrides as Partial<FoodEntryQueueItem>),
});

export const waterItem = (
  id: string,
  createdAt = '2026-10-17T08:05:00.000Z',
  previewMl: number | null = 250
): WaterQueueItem => ({
  ...base(id, createdAt),
  kind: 'water',
  payload: { containerId: 3 },
  previewMl,
});

export const checkInItem = (
  id: string,
  createdAt = '2026-10-17T08:10:00.000Z',
  weight = 80
): CheckInQueueItem => ({
  ...base(id, createdAt),
  kind: 'check_in',
  payload: { entryDate: '2026-10-17', weight },
});
