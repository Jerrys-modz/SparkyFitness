import {
  supplementLabelExtractionSchema,
  type SupplementLabelExtraction,
} from '@workspace/shared';
import OnDeviceNutritionModule, {
  type OnDeviceSupplementExtraction,
} from '../../modules/on-device-nutrition';
import { addLog } from './LogService';
import { isOnDeviceLabelScanAvailable } from './onDeviceLabelScan';
import { useAppPreferencesStore } from '../stores/appPreferencesStore';

// Largest amount a single Supplement Facts line can plausibly print (mcg of a
// B vitamin or IU of vitamin A reach the thousands, never millions).
const MAX_AMOUNT = 1_000_000;
// More than this share of lines the label text does not back up means the
// model is guessing, and the server's vision provider reads the photo instead.
const MAX_UNGROUNDED_SHARE = 1 / 3;

const FORMS = new Set([
  'tablet',
  'capsule',
  'softgel',
  'gummy',
  'powder',
  'liquid',
]);

// A comma between groups of three is a thousands separator ("1,000"); any
// other comma is a decimal comma ("1,5").
const NUMBER_PATTERN = /[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?|\d+(?:[.,]\d+)?/g;

function printedNumbers(text: string): Set<number> {
  const numbers = new Set<number>();
  for (const printed of text.match(NUMBER_PATTERN) ?? []) {
    const value = Number(
      /^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/.test(printed)
        ? printed.replace(/,/g, '')
        : printed.replace(',', '.')
    );
    if (Number.isFinite(value)) numbers.add(value);
  }
  return numbers;
}

/** The ingredient's first word of three letters or more, lower-cased. */
function nameKey(name: string): string | null {
  const word = name
    .toLowerCase()
    .split(/[^a-z]+/)
    .find((part) => part.length >= 3);
  return word ?? null;
}

/**
 * Keeps the ingredients whose name and amount both appear on the same line
 * the phone recognised. Null when too few do, so the caller falls back to the
 * server instead of pre-filling a number printed on a different line.
 */
export function groundSupplementLabel(
  r: OnDeviceSupplementExtraction
): SupplementLabelExtraction | null {
  const text = r.ocr_text?.trim();
  if (!text) return null;
  const ocrRows = text.split(/\r?\n/);

  const lines = r.ingredients.filter((i) => i.name.trim() !== '');
  const grounded = lines.filter((ingredient) => {
    const { amount } = ingredient;
    if (amount === null) return true;
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
      return false;
    }
    const key = nameKey(ingredient.name);
    return ocrRows.some(
      (row) =>
        printedNumbers(row).has(amount) &&
        (key === null || row.toLowerCase().includes(key))
    );
  });
  const withAmount = grounded.filter((i) => i.amount !== null);
  if (withAmount.length === 0) return null;
  if (lines.length - grounded.length > lines.length * MAX_UNGROUNDED_SHARE) {
    return null;
  }

  const form = r.form?.trim().toLowerCase() ?? null;
  const parsed = supplementLabelExtractionSchema.safeParse({
    name: r.name.trim() || null,
    brand: r.brand.trim() || null,
    form:
      form && FORMS.has(form)
        ? (form as SupplementLabelExtraction['form'])
        : null,
    serving: r.serving?.trim() || null,
    ingredients: grounded.map((i) => ({
      name: i.name.trim(),
      amount: i.amount,
      unit: i.unit?.trim() || null,
    })),
  });
  return parsed.success ? parsed.data : null;
}

/**
 * Reads a Supplement Facts panel with Apple's on-device model. Returns null
 * whenever the on-device path is off, unavailable, fails, or returns lines the
 * label text does not back up; the caller then uses the server scan. Shares the
 * "Scan Labels On Device" setting with the food label scan.
 */
export async function scanSupplementLabelOnDevice(
  base64Image: string
): Promise<SupplementLabelExtraction | null> {
  if (!useAppPreferencesStore.getState().onDeviceLabelScanEnabled) return null;
  if (!OnDeviceNutritionModule || !isOnDeviceLabelScanAvailable()) return null;
  try {
    const extraction =
      await OnDeviceNutritionModule.scanSupplementLabel(base64Image);
    const label = groundSupplementLabel(extraction);
    if (!label) {
      addLog(
        '[Supplement Scan] On-device values not found in the label text; falling back',
        'INFO'
      );
    }
    return label;
  } catch (error) {
    addLog(
      `[Supplement Scan] On-device scan failed: ${error instanceof Error ? error.message : String(error)}`,
      'WARNING'
    );
    return null;
  }
}
