import {
  LAB_MARKER_PRESETS,
  labRangeStatus,
  type LabMarkerPreset,
  type LabRangeStatus,
} from '@workspace/shared';
import type {
  CustomCategory,
  CustomMeasurementEntry,
} from '../types/customMeasurements';

/**
 * Lab markers use frequency `All` so the Daily editor, which only lists
 * `Daily` categories, never shows them.
 */
export const LAB_CATEGORY_FREQUENCY = 'All';

export type LabCategory = CustomCategory & { is_lab: true };

export const isLabCategory = (
  category: CustomCategory
): category is LabCategory => category.is_lab === true;

export const labMarkerName = (category: CustomCategory): string =>
  category.display_name?.trim() || category.name;

/** Parses a typed lab value; accepts a decimal comma. Null when not a number. */
export const parseLabValue = (text: string): number | null => {
  const trimmed = text.trim().replace(',', '.');
  if (trimmed === '') return null;
  const value = Number(trimmed);
  return Number.isFinite(value) && value >= 0 ? value : null;
};

/** Parses an optional range bound: empty is "no bound", junk is invalid. */
export const parseRangeBound = (
  text: string
): { ok: true; value: number | null } | { ok: false } => {
  if (text.trim() === '') return { ok: true, value: null };
  const value = parseLabValue(text);
  return value === null ? { ok: false } : { ok: true, value };
};

export const labStatus = (
  category: Pick<CustomCategory, 'ref_range_low' | 'ref_range_high'>,
  value: number
): LabRangeStatus =>
  labRangeStatus(
    value,
    category.ref_range_low ?? null,
    category.ref_range_high ?? null
  );

/** "4 - 5.6 %", "< 200 mg/dL", "> 40 mg/dL", or null with no range. */
export const formatLabRange = (
  low: number | null | undefined,
  high: number | null | undefined,
  unit: string
): string | null => {
  const suffix = unit ? ` ${unit}` : '';
  if (low != null && high != null) return `${low} - ${high}${suffix}`;
  if (high != null) return `< ${high}${suffix}`;
  if (low != null) return `> ${low}${suffix}`;
  return null;
};

export const formatLabValue = (value: number, unit: string): string =>
  unit ? `${value} ${unit}` : String(value);

export type LabHistoryPoint = {
  day: string;
  value: number;
};

/** Numeric entries as chart points, oldest first; non-numeric rows are dropped. */
export const labHistoryPoints = (
  entries: CustomMeasurementEntry[]
): LabHistoryPoint[] =>
  entries
    .map((entry) => ({
      day: entry.entry_date.slice(0, 10),
      value: parseLabValue(entry.value),
    }))
    .filter((point): point is LabHistoryPoint => point.value !== null)
    .sort((a, b) => a.day.localeCompare(b.day));

/** One row of the marker picker: a marker the user has, or a preset to create. */
export type LabPickerOption =
  | { kind: 'existing'; category: LabCategory }
  | { kind: 'preset'; preset: LabMarkerPreset };

/**
 * Picker contents for a search string: the user's own markers first, then the
 * presets they have not created yet. A preset whose category name already
 * exists is hidden, since that marker is already in the first group.
 */
export const buildLabPickerOptions = (
  categories: CustomCategory[],
  query: string
): LabPickerOption[] => {
  const needle = query.trim().toLowerCase();
  const matches = (text: string) =>
    needle === '' || text.toLowerCase().includes(needle);

  const existing = categories
    .filter(isLabCategory)
    .filter((c) => matches(labMarkerName(c)))
    .sort((a, b) => labMarkerName(a).localeCompare(labMarkerName(b)));
  const taken = new Set(categories.map((c) => c.name));

  const presets = LAB_MARKER_PRESETS.filter(
    (p) =>
      !taken.has(p.key) &&
      (matches(p.displayName) || p.aliases.some((alias) => matches(alias)))
  ).sort((a, b) => a.displayName.localeCompare(b.displayName));

  return [
    ...existing.map((category) => ({ kind: 'existing' as const, category })),
    ...presets.map((preset) => ({ kind: 'preset' as const, preset })),
  ];
};

export interface NewLabMarker {
  name: string;
  display_name: string;
  measurement_type: string;
  ref_range_low: number | null;
  ref_range_high: number | null;
}

export const newLabMarkerFromPreset = (
  preset: LabMarkerPreset
): NewLabMarker => ({
  name: preset.key,
  display_name: preset.displayName,
  measurement_type: preset.unit,
  ref_range_low: preset.refRangeLow,
  ref_range_high: preset.refRangeHigh,
});
