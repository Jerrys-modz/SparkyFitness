import type { DailySummaryRawData } from '../dailySummaryService';
import type { CheckInMeasurement } from '../../types/measurements';
import type { FoodEntry } from '../../types/foodEntries';
import type { QueueItem } from './types';

const PENDING_PREFIX = 'pending:';

export function pendingEntryId(queueId: string): string {
  return `${PENDING_PREFIX}${queueId}`;
}

/** A diary entry that exists only in the offline queue so far. */
export function isPendingEntryId(entryId: string | undefined): boolean {
  return typeof entryId === 'string' && entryId.startsWith(PENDING_PREFIX);
}

export function queueIdOfPendingEntry(entryId: string): string {
  return entryId.slice(PENDING_PREFIX.length);
}

/**
 * The day's server data plus what is still waiting to be sent for that day.
 * Returns `raw` itself when nothing is waiting, so a memoised caller sees no
 * change.
 */
export function overlayDailySummary(
  raw: DailySummaryRawData,
  items: readonly QueueItem[],
  date: string
): DailySummaryRawData {
  const todays = items.filter((item) => item.entryDate === date);
  if (todays.length === 0) return raw;

  const knownIds = new Set(raw.foodEntries.map((entry) => entry.id));
  const pendingFood: FoodEntry[] = [];
  let pendingWaterMl = 0;
  for (const item of todays) {
    if (item.kind === 'food_entry') {
      if (!knownIds.has(item.preview.id)) pendingFood.push(item.preview);
    } else if (item.kind === 'water' && item.previewMl != null) {
      pendingWaterMl += item.previewMl;
    }
  }
  if (pendingFood.length === 0 && pendingWaterMl === 0) return raw;

  return {
    ...raw,
    foodEntries: [...raw.foodEntries, ...pendingFood],
    waterIntake: {
      ...raw.waterIntake,
      water_ml: (raw.waterIntake.water_ml || 0) + pendingWaterMl,
    },
  };
}

/** The day's check-in with queued measurements applied on top, oldest first. */
export function overlayCheckIn(
  measurement: CheckInMeasurement | undefined,
  items: readonly QueueItem[],
  date: string
): CheckInMeasurement | undefined {
  const pending = items.filter(
    (item) => item.kind === 'check_in' && item.entryDate === date
  );
  if (pending.length === 0) return measurement;

  const merged: CheckInMeasurement = {
    ...(measurement ?? { entry_date: date }),
  };
  for (const item of pending) {
    if (item.kind !== 'check_in') continue;
    const p = item.payload;
    if (p.weight !== undefined) merged.weight = p.weight;
    if (p.neck !== undefined) merged.neck = p.neck;
    if (p.waist !== undefined) merged.waist = p.waist;
    if (p.hips !== undefined) merged.hips = p.hips;
    if (p.steps !== undefined) merged.steps = p.steps;
    if (p.height !== undefined) merged.height = p.height;
    if (p.bodyFatPercentage !== undefined)
      merged.body_fat_percentage = p.bodyFatPercentage;
    if (p.muscleMassKg !== undefined) merged.muscle_mass_kg = p.muscleMassKg;
    if (p.boneMassKg !== undefined) merged.bone_mass_kg = p.boneMassKg;
    if (p.bodyWaterPercentage !== undefined)
      merged.body_water_percentage = p.bodyWaterPercentage;
    if (p.bmr !== undefined) merged.bmr = p.bmr;
  }
  return merged;
}
