import {
  LAB_MARKER_PRESETS,
  labPresetRange,
  type LabReportScanResult,
  type LabSex,
} from '@workspace/shared';
import type { CustomCategory } from '../types/customMeasurements';
import {
  isLabCategory,
  labMarkerName,
  newLabMarkerFromPreset,
  type LabCategory,
  type NewLabMarker,
} from './labResults';

/** Why a scanned result cannot be imported as is. */
export type LabImportBlock =
  'unit_mismatch' | 'name_taken' | 'no_unit' | 'duplicate';

export interface LabImportRow {
  /** Stable key within one scan. */
  key: string;
  result: LabReportScanResult;
  /** Shown as the row title. */
  title: string;
  /** The unit the marker's results are stored in. */
  markerUnit: string;
  target:
    | { kind: 'existing'; category: LabCategory }
    | { kind: 'new'; marker: NewLabMarker; defaultRange: RangeBounds };
  /** The range printed on the report, when it printed one. */
  reportRange: RangeBounds | null;
  blocked: LabImportBlock | null;
}

export interface RangeBounds {
  low: number | null;
  high: number | null;
}

/**
 * Spellings of the same unit, as printed by different labs, after the basic
 * normalisation below. Only exact equivalences belong here: a value in one
 * spelling is numerically identical in the other, so no conversion is needed.
 */
const UNIT_EQUIVALENTS: Readonly<Record<string, string>> = {
  // 1 uIU/mL = 1 mIU/L
  'uiu/ml': 'miu/l',
  // Enzyme activity: IU/L and U/L are the same.
  'iu/l': 'u/l',
  // 1 ng/mL = 1 ug/L
  'ug/l': 'ng/ml',
  'mcg/dl': 'ug/dl',
  // For the monovalent ions (sodium, potassium, chloride, bicarbonate).
  'meq/l': 'mmol/l',
  // Blood counts: x10E3/uL, K/uL, thousand/uL are 10^3 per uL.
  'x10e3/ul': '103/ul',
  '10e3/ul': '103/ul',
  'x10^3/ul': '103/ul',
  '10^3/ul': '103/ul',
  'k/ul': '103/ul',
  'thousand/ul': '103/ul',
  'x10e6/ul': '106/ul',
  '10e6/ul': '106/ul',
  'x10^6/ul': '106/ul',
  '10^6/ul': '106/ul',
  'm/ul': '106/ul',
  'million/ul': '106/ul',
  // eGFR is per 1.73 m2 of body surface whether or not the report prints it.
  'ml/min/1.73': 'ml/min/1.73m2',
  'ml/min/1.73m^2': 'ml/min/1.73m2',
};

/** "mg/dL" and "MG/DL " are the same unit; "µ" and "u" are interchangeable. */
const normalizeUnit = (unit: string | null | undefined): string => {
  const base = (unit ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[µμ]/g, 'u')
    .replace(/²/g, '2')
    .replace(/³/g, '3')
    .replace(/⁶/g, '6');
  return UNIT_EQUIVALENTS[base] ?? base;
};

export const sameLabUnit = (
  a: string | null | undefined,
  b: string | null | undefined
): boolean => normalizeUnit(a) === normalizeUnit(b);

const sameRange = (a: RangeBounds, b: RangeBounds): boolean =>
  a.low === b.low && a.high === b.high;

const findExisting = (
  result: LabReportScanResult,
  categories: CustomCategory[]
): CustomCategory | undefined => {
  if (result.marker_key) {
    const byKey = categories.find((c) => c.name === result.marker_key);
    if (byKey) return byKey;
  }
  const needle = result.name.trim().toLowerCase();
  return categories.find(
    (c) =>
      isLabCategory(c) &&
      (c.name.toLowerCase() === needle ||
        labMarkerName(c).toLowerCase() === needle)
  );
};

/**
 * Turns scanned results into import rows: each is matched to one of the user's
 * lab markers, or to a new marker (from a preset when the server recognised the
 * name). A row that would save a wrong or unsafe value is blocked instead:
 * a different unit than the marker uses (there is no conversion), a name a
 * non-lab measurement already uses, a new marker with no unit, or a second
 * result for a marker already in the report.
 */
export function planLabImport(
  results: LabReportScanResult[],
  categories: CustomCategory[],
  sex: LabSex | null
): LabImportRow[] {
  const seen = new Set<string>();

  return results.map((result, index): LabImportRow => {
    const reportRange: RangeBounds | null =
      result.ref_low !== null || result.ref_high !== null
        ? { low: result.ref_low, high: result.ref_high }
        : null;
    const existing = findExisting(result, categories);

    // A marker the user already has: save to it, unless the unit differs.
    if (existing && isLabCategory(existing)) {
      const key = `id:${existing.id}`;
      const duplicate = seen.has(key);
      seen.add(key);
      const unitOk = sameLabUnit(
        result.unit ?? existing.measurement_type,
        existing.measurement_type
      );
      return {
        key: String(index),
        result,
        title: labMarkerName(existing),
        markerUnit: existing.measurement_type,
        target: { kind: 'existing', category: existing },
        reportRange,
        blocked: duplicate ? 'duplicate' : unitOk ? null : 'unit_mismatch',
      };
    }

    // Otherwise a new marker, from the preset when the server recognised it.
    const preset = result.marker_key
      ? LAB_MARKER_PRESETS.find((p) => p.key === result.marker_key)
      : undefined;
    const base: NewLabMarker = preset
      ? newLabMarkerFromPreset(preset, sex)
      : {
          name: result.name.trim(),
          display_name: result.name.trim(),
          measurement_type: '',
          ref_range_low: null,
          ref_range_high: null,
        };
    const defaultRange: RangeBounds = preset
      ? labPresetRange(preset, sex)
      : { low: null, high: null };
    const unit = result.unit?.trim() || base.measurement_type;
    const marker: NewLabMarker = {
      ...base,
      measurement_type: unit,
      ref_range_low: reportRange ? reportRange.low : base.ref_range_low,
      ref_range_high: reportRange ? reportRange.high : base.ref_range_high,
    };
    const key = `name:${marker.name.toLowerCase()}`;
    const duplicate = seen.has(key);
    seen.add(key);
    // A preset's unit is the one results are charted in. A report that prints a
    // different unit for it (mmol/L vs mg/dL) cannot be saved without converting.
    const unitConflict =
      preset !== undefined &&
      result.unit !== null &&
      !sameLabUnit(result.unit, preset.unit);
    return {
      key: String(index),
      result,
      title: marker.display_name,
      markerUnit: preset?.unit ?? unit,
      target: { kind: 'new', marker, defaultRange },
      reportRange,
      blocked: existing
        ? 'name_taken'
        : duplicate
          ? 'duplicate'
          : unit === ''
            ? 'no_unit'
            : unitConflict
              ? 'unit_mismatch'
              : null,
    };
  });
}

/** The reference range a row would be saved with. */
export function effectiveLabRange(
  row: LabImportRow,
  useReportRanges: boolean
): RangeBounds {
  if (row.target.kind === 'existing') {
    const current: RangeBounds = {
      low: row.target.category.ref_range_low ?? null,
      high: row.target.category.ref_range_high ?? null,
    };
    return useReportRanges && row.reportRange ? row.reportRange : current;
  }
  return useReportRanges
    ? labMarkerRange(row.target.marker)
    : row.target.defaultRange;
}

const labMarkerRange = (marker: NewLabMarker): RangeBounds => ({
  low: marker.ref_range_low,
  high: marker.ref_range_high,
});

/** True when the report prints a range that differs from the existing marker's. */
export function reportRangeDiffers(row: LabImportRow): boolean {
  if (row.target.kind !== 'existing' || !row.reportRange) return false;
  return !sameRange(row.reportRange, {
    low: row.target.category.ref_range_low ?? null,
    high: row.target.category.ref_range_high ?? null,
  });
}

/**
 * The input for saving one included row. With `useReportRanges` the report's
 * printed range is applied (to a new marker as it is created, to an existing
 * marker as an update); without it new markers keep the preset default and
 * existing markers keep their range.
 */
export function labImportSaveInput(
  row: LabImportRow,
  options: { date: string; useReportRanges: boolean; value?: number }
) {
  const base = { value: options.value ?? row.result.value, date: options.date };
  if (row.target.kind === 'existing') {
    return {
      ...base,
      target: { categoryId: row.target.category.id },
      updateRange:
        options.useReportRanges && reportRangeDiffers(row) && row.reportRange
          ? row.reportRange
          : undefined,
    };
  }
  const range = effectiveLabRange(row, options.useReportRanges);
  return {
    ...base,
    target: {
      newMarker: {
        ...row.target.marker,
        ref_range_low: range.low,
        ref_range_high: range.high,
      },
    },
  };
}
