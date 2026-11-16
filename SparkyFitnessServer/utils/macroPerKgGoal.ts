import {
  computeMacroTargets,
  DEFAULT_MACRO_WEIGHT_BASIS,
  isMacroWeightBasis,
  MACRO_PER_KG_LIMITS,
  MACRO_REFERENCE_WEIGHT_LIMITS,
  normalizeMacroPerKg,
  normalizeMacroReferenceWeight,
  type MacroPerKgKey,
  type MacroTargetInput,
  type MacroTargets,
  type MacroWeightBasis,
} from '@workspace/shared';
import measurementRepository from '../models/measurementRepository.js';
import { ValidationError } from './errors.js';

/** The per-kg goal columns of `user_goals` and `goal_presets`. */
export interface MacroPerKgFields {
  protein_per_kg: number | null;
  carbs_per_kg: number | null;
  fat_per_kg: number | null;
  macro_per_kg_basis: MacroWeightBasis;
  /** Fixed reference weight in kg; null follows the logged weight. */
  macro_reference_weight_kg: number | null;
}

/** Request body keys of the per-kg fields. */
export interface MacroPerKgKeys {
  protein: string;
  carbs: string;
  fat: string;
  basis: string;
  referenceWeight: string;
}

const DEFAULT_KEYS: MacroPerKgKeys = {
  protein: 'protein_per_kg',
  carbs: 'carbs_per_kg',
  fat: 'fat_per_kg',
  basis: 'macro_per_kg_basis',
  referenceWeight: 'macro_reference_weight_kg',
};

export interface MacroPerKgInput {
  /** False when the request sent none of the fields (an older client). */
  supplied: boolean;
  fields: MacroPerKgFields;
}

const isBlank = (value: unknown) =>
  value === null ||
  value === undefined ||
  (typeof value === 'string' && value.trim() === '');

function readPerKg(macro: MacroPerKgKey, value: unknown): number | null {
  if (isBlank(value)) return null;
  const normalized = normalizeMacroPerKg(macro, value);
  if (normalized === null) {
    const { min, max } = MACRO_PER_KG_LIMITS[macro];
    throw new ValidationError(
      `${macro}_per_kg must be a number from ${min} to ${max}.`
    );
  }
  return normalized;
}

function readReferenceWeight(value: unknown): number | null {
  if (isBlank(value)) return null;
  const normalized = normalizeMacroReferenceWeight(value);
  if (normalized === null) {
    const { min, max } = MACRO_REFERENCE_WEIGHT_LIMITS;
    throw new ValidationError(
      `macro_reference_weight_kg must be a number from ${min} to ${max}.`
    );
  }
  return normalized;
}

/**
 * Reads the per-kg fields from a goal or preset body. `keys` names the body
 * fields (the timeline route prefixes them with `p_`). Throws ValidationError
 * for a value out of range or an unknown basis.
 */
export function readMacroPerKgInput(
  body: Record<string, unknown>,
  keys: MacroPerKgKeys = DEFAULT_KEYS
): MacroPerKgInput {
  const supplied = Object.values(keys).some((key) => body[key] !== undefined);
  const basisValue = body[keys.basis];
  if (!isBlank(basisValue) && !isMacroWeightBasis(basisValue)) {
    throw new ValidationError(
      'macro_per_kg_basis must be body_weight or lean_mass.'
    );
  }
  return {
    supplied,
    fields: {
      protein_per_kg: readPerKg('protein', body[keys.protein]),
      carbs_per_kg: readPerKg('carbs', body[keys.carbs]),
      fat_per_kg: readPerKg('fat', body[keys.fat]),
      macro_per_kg_basis: isMacroWeightBasis(basisValue)
        ? basisValue
        : DEFAULT_MACRO_WEIGHT_BASIS,
      macro_reference_weight_kg: readReferenceWeight(
        body[keys.referenceWeight]
      ),
    },
  };
}

/** The per-kg fields stored on a goal row, or none when it predates them. */
export function storedMacroPerKgFields(
  row: Record<string, unknown> | null | undefined
): MacroPerKgFields {
  return {
    protein_per_kg: normalizeMacroPerKg('protein', row?.protein_per_kg),
    carbs_per_kg: normalizeMacroPerKg('carbs', row?.carbs_per_kg),
    fat_per_kg: normalizeMacroPerKg('fat', row?.fat_per_kg),
    macro_per_kg_basis: isMacroWeightBasis(row?.macro_per_kg_basis)
      ? row.macro_per_kg_basis
      : DEFAULT_MACRO_WEIGHT_BASIS,
    macro_reference_weight_kg: normalizeMacroReferenceWeight(
      row?.macro_reference_weight_kg
    ),
  };
}

/** The shared calculation's per-kg inputs for stored fields. */
export function macroPerKgTargetInput(
  fields: MacroPerKgFields
): Pick<
  MacroTargetInput,
  'proteinPerKg' | 'carbsPerKg' | 'fatPerKg' | 'basis' | 'referenceWeightKg'
> {
  return {
    proteinPerKg: fields.protein_per_kg,
    carbsPerKg: fields.carbs_per_kg,
    fatPerKg: fields.fat_per_kg,
    basis: fields.macro_per_kg_basis,
    referenceWeightKg: fields.macro_reference_weight_kg,
  };
}

/** True when the goal follows the logged weight (no fixed reference weight). */
export function followsLoggedWeight(fields: MacroPerKgFields): boolean {
  return fields.macro_reference_weight_kg === null;
}

export interface BodyMeasurementsOnDay {
  weightKg: number | null;
  bodyFatPercentage: number | null;
}

const positiveOrNull = (value: unknown): number | null => {
  const num = Number(value);
  return value !== null &&
    value !== undefined &&
    Number.isFinite(num) &&
    num > 0
    ? num
    : null;
};

/** The latest weight and body-fat reading on or before the day. */
export async function bodyMeasurementsOnOrBefore(
  userId: string,
  day: string
): Promise<BodyMeasurementsOnDay> {
  const row =
    (await measurementRepository.getLatestCheckInMeasurementsOnOrBeforeDate(
      userId,
      day
    )) as Record<string, unknown> | null;
  return {
    weightKg: positiveOrNull(row?.weight),
    bodyFatPercentage: positiveOrNull(row?.body_fat_percentage),
  };
}

/**
 * The grams to save with a goal or preset that sets a macro per kg, worked
 * out from the fixed reference weight or the weight on the given day. They
 * are the fallback for a day with no weight logged, and what older clients
 * display.
 */
export function macroGramsToStore(
  goal: Omit<
    MacroTargetInput,
    'proteinPerKg' | 'carbsPerKg' | 'fatPerKg' | 'basis' | 'referenceWeightKg'
  >,
  fields: MacroPerKgFields,
  measurements: BodyMeasurementsOnDay
): MacroTargets {
  return computeMacroTargets({
    ...goal,
    ...macroPerKgTargetInput(fields),
    weightKg: measurements.weightKg,
    bodyFatPercentage: measurements.bodyFatPercentage,
  });
}
