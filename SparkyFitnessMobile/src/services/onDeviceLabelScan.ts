import OnDeviceNutritionModule, {
  type OnDeviceLabelExtraction,
} from '../../modules/on-device-nutrition';
import type { LabelScanResult } from './api/externalFoodSearchApi';
import { addLog } from './LogService';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

const MAX_CALORIES = 3000;
const MAX_GRAMS = 500;
const MAX_MG = 20000;
// Atwater energy from macros may differ from the printed value (rounding,
// fiber, sugar alcohols), so allow a generous band before distrusting it.
const ENERGY_TOLERANCE = 0.35;

export function isOnDeviceLabelScanAvailable(): boolean {
  try {
    return OnDeviceNutritionModule?.isAvailable() === true;
  } catch {
    return false;
  }
}

function inRange(value: number | null, max: number): boolean {
  return (
    value === null || (Number.isFinite(value) && value >= 0 && value <= max)
  );
}

/**
 * Rejects a model extraction that cannot be a real label so the caller falls
 * back to the server instead of pre-filling invented numbers.
 */
export function isPlausibleLabel(r: OnDeviceLabelExtraction): boolean {
  const { calories, protein, carbs, fat, sugars, fiber } = r;
  if (calories === null || protein === null || carbs === null || fat === null) {
    return false;
  }
  if (!inRange(calories, MAX_CALORIES)) return false;
  for (const g of [
    protein,
    carbs,
    fat,
    sugars,
    fiber,
    r.saturated_fat,
    r.trans_fat,
  ]) {
    if (!inRange(g, MAX_GRAMS)) return false;
  }
  for (const mg of [r.sodium, r.cholesterol, r.potassium, r.calcium, r.iron]) {
    if (!inRange(mg, MAX_MG)) return false;
  }
  if (sugars !== null && sugars > carbs + 0.5) return false;
  if (fiber !== null && fiber > carbs + 0.5) return false;
  if (r.saturated_fat !== null && r.saturated_fat > fat + 0.5) return false;
  const atwater = protein * 4 + carbs * 4 + fat * 9;
  if (calories > 20 && atwater > 0) {
    if (
      Math.abs(calories - atwater) / Math.max(calories, atwater) >
      ENERGY_TOLERANCE
    ) {
      return false;
    }
  }
  return true;
}

// Units a per-100 basis can be read in when the label counts liquids by volume.
const VOLUME_UNITS = new Set(['ml', 'l', 'cl', 'dl', 'oz', 'fl oz', 'cup']);

// A comma between groups of three ("1,000", "12,345.5") is a thousands
// separator; any other comma ("1,5", "0,500") is a decimal comma.
const NUMBER_PATTERN = /[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/g;

function parsePrintedNumber(printed: string): number {
  return Number(
    /^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/.test(printed)
      ? printed.replace(/,/g, '')
      : printed.replace(',', '.')
  );
}

/**
 * True when every macro the model returned appears as a number in the text
 * recognised on the label. A value the model made up, or read off the wrong
 * column, is usually not printed anywhere. With no text read there is nothing
 * to check the numbers against, so the server-side scan takes over.
 */
export function isGroundedInLabelText(r: OnDeviceLabelExtraction): boolean {
  const text = r.ocr_text?.trim();
  if (!text) return false;
  const printed = new Set(
    (text.match(NUMBER_PATTERN) ?? []).map(parsePrintedNumber)
  );
  return [r.calories, r.protein, r.carbs, r.fat].every(
    (value) => value === null || printed.has(value)
  );
}

export function toLabelScanResult(r: OnDeviceLabelExtraction): LabelScanResult {
  const unit = (r.serving_unit ?? '').trim().toLowerCase();
  // Per-100 labels: the printed numbers are for 100 of the unit.
  const per100 = r.values_are_per_100;
  return {
    name: r.name,
    brand: r.brand,
    serving_size: per100 ? 100 : (r.serving_size ?? 0),
    serving_unit: per100 ? (VOLUME_UNITS.has(unit) ? 'ml' : 'g') : unit || 'g',
    calories: r.calories ?? 0,
    protein: r.protein ?? 0,
    carbs: r.carbs ?? 0,
    fat: r.fat ?? 0,
    fiber: r.fiber,
    saturated_fat: r.saturated_fat,
    trans_fat: r.trans_fat,
    sodium: r.sodium,
    sugars: r.sugars,
    cholesterol: r.cholesterol,
    potassium: r.potassium,
    calcium: r.calcium,
    iron: r.iron,
    caffeine_mg: null,
    water_ml: null,
    alcohol_g: null,
    vitamin_a: null,
    vitamin_c: null,
  };
}

/**
 * Reads a nutrition label with Apple's on-device model. Returns null whenever
 * the on-device path is unavailable, fails, or returns implausible numbers;
 * the caller then uses the server-side scan.
 */
export async function scanLabelOnDevice(
  base64Image: string
): Promise<LabelScanResult | null> {
  if (!useAppPreferencesStore.getState().onDeviceLabelScanEnabled) return null;
  if (!OnDeviceNutritionModule || !isOnDeviceLabelScanAvailable()) return null;
  try {
    const extraction = await OnDeviceNutritionModule.scanLabel(base64Image);
    if (!isGroundedInLabelText(extraction)) {
      addLog(
        '[Label Scan] On-device values not found in the label text; falling back',
        'INFO'
      );
      return null;
    }
    if (!isPlausibleLabel(extraction)) {
      addLog('[Label Scan] On-device result implausible; falling back', 'INFO');
      return null;
    }
    return toLabelScanResult(extraction);
  } catch (error) {
    addLog(
      `[Label Scan] On-device scan failed: ${error instanceof Error ? error.message : String(error)}`,
      'WARNING'
    );
    return null;
  }
}
