import {
  LAB_MARKER_PRESETS,
  labPresetRange,
  type ImportLabReportBody,
  type LabMarkerPreset,
  type LabReportScanResult,
  type LabSex,
} from '@workspace/shared';
import {
  labPresetName,
  type LabMarker,
  type LabMarkerLabels,
} from './labResults';

/** Why a scanned result cannot be imported. */
export type LabImportBlock = 'duplicate';

/** Something to check before saving, which does not stop the import. */
export type LabImportWarning = 'unit_differs';

export interface RangeBounds {
  low: number | null;
  high: number | null;
}

export interface LabImportRow {
  /** Stable key within one scan. */
  key: string;
  result: LabReportScanResult;
  /** Shown as the row title. */
  title: string;
  /** What the result is saved to. */
  target:
    | { kind: 'builtin'; preset: LabMarkerPreset }
    | { kind: 'custom'; name: string; existing: boolean };
  /** The unit saved with the result: the one the report prints, else the marker's. */
  unit: string;
  /** The unit of the marker's earlier results, when it has any. */
  earlierUnit: string | null;
  /** The reference range saved with the result. */
  range: RangeBounds;
  /** The range the report printed, when it printed one. */
  reportRange: RangeBounds | null;
  blocked: LabImportBlock | null;
  warning: LabImportWarning | null;
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

const presetByKey = (key: string | null): LabMarkerPreset | undefined =>
  key ? LAB_MARKER_PRESETS.find((p) => p.key === key) : undefined;

/**
 * Turns scanned results into import rows. Each is matched to a built-in marker
 * (when the server recognised the name), to one of the user's own markers by
 * name, or to a new marker of that name. It keeps the unit and the reference
 * range the report printed; with no printed range it takes the marker's own.
 * A second result for a marker already in the report is blocked, and a unit
 * that differs from the marker's earlier results is flagged, not converted.
 */
export function planLabImport(
  results: LabReportScanResult[],
  markers: LabMarker[],
  labels: LabMarkerLabels,
  sex: LabSex | null
): LabImportRow[] {
  const seen = new Set<string>();

  return results.map((result, index): LabImportRow => {
    const reportRange: RangeBounds | null =
      result.ref_low !== null || result.ref_high !== null
        ? { low: result.ref_low, high: result.ref_high }
        : null;
    const printedUnit = result.unit?.trim() ?? '';

    const preset = presetByKey(result.marker_key);
    const name = result.name.trim();
    const custom = preset
      ? undefined
      : markers.find(
          (m) =>
            m.markerId !== null && m.name.toLowerCase() === name.toLowerCase()
        );

    let title: string;
    let target: LabImportRow['target'];
    let identity: string;
    let earlierUnit: string | null;
    let defaultRange: RangeBounds;
    if (preset) {
      const earlier = markers.find((m) => m.markerKey === preset.key);
      title = labPresetName(preset, labels);
      target = { kind: 'builtin', preset };
      identity = `key:${preset.key}`;
      earlierUnit = earlier?.latest ? earlier.unit : null;
      const range = labPresetRange(preset, sex);
      defaultRange = { low: range.low, high: range.high };
    } else {
      title = custom?.name ?? name;
      target = {
        kind: 'custom',
        name: custom?.name ?? name,
        existing: !!custom,
      };
      identity = `name:${(custom?.name ?? name).toLowerCase()}`;
      earlierUnit = custom?.latest ? custom.unit : null;
      defaultRange = {
        low: custom?.ref_range_low ?? null,
        high: custom?.ref_range_high ?? null,
      };
    }

    const duplicate = seen.has(identity);
    seen.add(identity);
    const unit = printedUnit || (preset?.unit ?? custom?.unit ?? '');

    return {
      key: String(index),
      result,
      title,
      target,
      unit,
      earlierUnit,
      range: reportRange ?? defaultRange,
      reportRange,
      blocked: duplicate ? 'duplicate' : null,
      warning:
        earlierUnit !== null && unit !== '' && !sameLabUnit(unit, earlierUnit)
          ? 'unit_differs'
          : null,
    };
  });
}

/** The body for saving the included rows as one report. */
export function labImportBody(
  rows: LabImportRow[],
  options: {
    labName: string | null;
    date: string;
    values: Record<string, number>;
  }
): ImportLabReportBody {
  return {
    lab_name: options.labName,
    entry_date: options.date,
    results: rows.map((row) => ({
      ...(row.target.kind === 'builtin'
        ? { marker_key: row.target.preset.key }
        : { marker_name: row.target.name }),
      value_numeric: options.values[row.key] ?? row.result.value,
      unit: row.unit,
      ref_range_low: row.range.low,
      ref_range_high: row.range.high,
    })),
  };
}
