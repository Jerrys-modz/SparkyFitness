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

function parsePrinted(printed: string): number {
  return Number(
    /^[1-9]\d{0,2}(?:,\d{3})+(?:\.\d+)?$/.test(printed)
      ? printed.replace(/,/g, '')
      : printed.replace(',', '.')
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Every letter or number in the name, so "Vitamin D" is not just "vitamin". */
function nameTokens(name: string): string[] {
  return name.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function rowConfirmsName(row: string, name: string): boolean {
  const tokens = nameTokens(name);
  if (tokens.length === 0) return false;
  const lower = row.toLowerCase();
  return tokens.every((token) =>
    new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(token)}(?:[^a-z0-9]|$)`).test(
      lower
    )
  );
}

/** The amount must sit next to its unit, so a %DV on the same line does not count. */
function rowHasAmountAndUnit(
  row: string,
  amount: number,
  unit: string | null
): boolean {
  const normalized = unit?.trim();
  if (!normalized) return false;
  const unitPattern = new RegExp(
    `^\\s*${escapeRegExp(normalized)}(?![a-zA-Z])`,
    'i'
  );
  const pattern = new RegExp(NUMBER_PATTERN.source, 'g');
  for (const match of row.matchAll(pattern)) {
    if (parsePrinted(match[0]) !== amount) continue;
    const after = row.slice((match.index ?? 0) + match[0].length);
    if (unitPattern.test(after)) return true;
  }
  return false;
}

/**
 * Keeps the ingredients whose full name, amount, and unit all appear on the
 * same line the phone recognised. A bare number, including a %DV, does not
 * count. Null when too few lines check out, so the caller falls back to the
 * server.
 */
export function groundSupplementLabel(
  r: OnDeviceSupplementExtraction
): SupplementLabelExtraction | null {
  const text = r.ocr_text?.trim();
  if (!text) return null;
  const ocrRows = text.split(/\r?\n/);

  const lines = r.ingredients.filter((i) => i.name.trim() !== '');
  const grounded = lines.filter((ingredient) => {
    const { amount, unit } = ingredient;
    if (amount === null) return true;
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_AMOUNT) {
      return false;
    }
    return ocrRows.some(
      (row) =>
        rowHasAmountAndUnit(row, amount, unit) &&
        rowConfirmsName(row, ingredient.name)
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
