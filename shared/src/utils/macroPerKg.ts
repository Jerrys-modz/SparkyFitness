/**
 * Macro goals set in grams per kg of body weight (or of lean mass), #3617.
 *
 * A goal row (`user_goals`, `goal_presets`) may hold `protein_per_kg`,
 * `carbs_per_kg` and/or `fat_per_kg` with a `macro_per_kg_basis` and an
 * optional `macro_reference_weight_kg`. Without a reference weight the grams
 * follow the latest weight measured on or before the diary day, so a target
 * set by hand no longer stays behind while weight goes down. With one, the
 * grams use that fixed weight (for lean mass basis: the fixed lean mass) and
 * change only when the goal is saved again. One function works out a day's
 * macro grams for the server, the web Goals preview and the mobile Goals
 * preview.
 *
 * Remaining calories (#1955): a per-kg macro is locked at its grams. When the
 * goal is in percentage mode, the calories left after the locked macros (and
 * after the fibre allowance the percentage maths already subtracts) go to the
 * macros that are not locked, in proportion to their percentages. With protein
 * and fat per kg, carbs take all of the remainder. When the goal is in gram
 * mode, macros that are not per kg keep the grams the person typed.
 */

export const MACRO_WEIGHT_BASES = ['body_weight', 'lean_mass'] as const;
export type MacroWeightBasis = (typeof MACRO_WEIGHT_BASES)[number];

export const DEFAULT_MACRO_WEIGHT_BASIS: MacroWeightBasis = 'body_weight';

/** Accepted g/kg values; the database CHECK constraints use the same bounds. */
export const MACRO_PER_KG_LIMITS = {
  protein: { min: 0.1, max: 5 },
  carbs: { min: 0.5, max: 12 },
  fat: { min: 0.1, max: 3 },
} as const;

export type MacroPerKgKey = keyof typeof MACRO_PER_KG_LIMITS;

/** Accepted fixed reference weight in kg; the database CHECK matches. */
export const MACRO_REFERENCE_WEIGHT_LIMITS = { min: 20, max: 400 } as const;

/** A usable fixed reference weight in kg, or null (follow logged weight). */
export function normalizeMacroReferenceWeight(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const { min, max } = MACRO_REFERENCE_WEIGHT_LIMITS;
  return num >= min && num <= max ? num : null;
}

/** Body-fat readings outside this range are not used for lean mass. */
const LEAN_MASS_BODY_FAT_RANGE = { min: 2, max: 70 } as const;

export function isMacroWeightBasis(value: unknown): value is MacroWeightBasis {
  return (
    typeof value === 'string' &&
    (MACRO_WEIGHT_BASES as readonly string[]).includes(value)
  );
}

/** A usable g/kg value for the macro, or null when unset or out of range. */
export function normalizeMacroPerKg(
  macro: MacroPerKgKey,
  value: unknown
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  const { min, max } = MACRO_PER_KG_LIMITS[macro];
  if (num < min || num > max) return null;
  return num;
}

export interface MacroBasisWeight {
  /** Kilograms the per-kg values multiply; null when no weight is logged. */
  basisKg: number | null;
  /** The basis actually used (lean mass falls back to body weight). */
  basisUsed: MacroWeightBasis | null;
  /** Lean mass was chosen but no usable body-fat percentage was logged. */
  leanMassFallback: boolean;
}

export function resolveMacroBasisWeight(
  weightKg: number | null | undefined,
  bodyFatPercentage: number | null | undefined,
  basis: MacroWeightBasis
): MacroBasisWeight {
  const weight = Number(weightKg);
  if (!Number.isFinite(weight) || weight <= 0) {
    return { basisKg: null, basisUsed: null, leanMassFallback: false };
  }
  if (basis === 'lean_mass') {
    const bodyFat = Number(bodyFatPercentage);
    if (
      Number.isFinite(bodyFat) &&
      bodyFat >= LEAN_MASS_BODY_FAT_RANGE.min &&
      bodyFat <= LEAN_MASS_BODY_FAT_RANGE.max
    ) {
      return {
        basisKg: weight * (1 - bodyFat / 100),
        basisUsed: 'lean_mass',
        leanMassFallback: false,
      };
    }
    return {
      basisKg: weight,
      basisUsed: 'body_weight',
      leanMassFallback: true,
    };
  }
  return { basisKg: weight, basisUsed: 'body_weight', leanMassFallback: false };
}

export interface MacroTargetInput {
  /** Calories the macros share (the day's target, plus any exercise credit). */
  calories: number;
  dietaryFiber?: number | null;
  /** Stored grams: used in gram mode, and for a per-kg macro with no weight. */
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
  proteinPercentage?: number | null;
  carbsPercentage?: number | null;
  fatPercentage?: number | null;
  proteinPerKg?: number | null;
  carbsPerKg?: number | null;
  fatPerKg?: number | null;
  basis?: MacroWeightBasis | null;
  /**
   * Fixed reference weight in kg (lean mass when the basis is lean mass);
   * null or absent follows the logged weight.
   */
  referenceWeightKg?: number | null;
  /** Latest weight measured on or before the day, in kg. */
  weightKg?: number | null;
  /** Latest body-fat percentage measured on or before the day. */
  bodyFatPercentage?: number | null;
}

/** How a day's per-kg goal was resolved; sent with the day's goals. */
export interface MacroPerKgResolution {
  protein_per_kg: number | null;
  carbs_per_kg?: number | null;
  fat_per_kg: number | null;
  requested_basis: MacroWeightBasis;
  basis_used: MacroWeightBasis | null;
  basis_kg: number | null;
  weight_kg: number | null;
  /** `fixed`: a reference weight saved with the goal; `logged`: latest weight. */
  reference?: 'fixed' | 'logged';
  /** No weight logged on or before the day: stored grams were used. */
  missing_weight: boolean;
  /** Lean mass chosen without a body-fat reading: body weight was used. */
  lean_mass_fallback: boolean;
  /** Calories of the per-kg macros, and the calories they are taken from. */
  locked_kcal?: number;
  available_kcal?: number;
}

export interface MacroTargets {
  protein: number;
  carbs: number;
  fat: number;
  /** Null when no macro is set per kg. */
  perKg: MacroPerKgResolution | null;
}

const finiteOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const MACROS = ['protein', 'carbs', 'fat'] as const;
type Macro = (typeof MACROS)[number];
const KCAL_PER_GRAM: Record<Macro, number> = { protein: 4, carbs: 4, fat: 9 };

/** True when the goal sets any macro per kg. */
export function hasMacroPerKg(goal: {
  protein_per_kg?: unknown;
  carbs_per_kg?: unknown;
  fat_per_kg?: unknown;
}): boolean {
  return (
    normalizeMacroPerKg('protein', goal.protein_per_kg) !== null ||
    normalizeMacroPerKg('carbs', goal.carbs_per_kg) !== null ||
    normalizeMacroPerKg('fat', goal.fat_per_kg) !== null
  );
}

/** True when all three macro percentages are set (percentage mode). */
export function hasMacroPercentages(goal: {
  proteinPercentage?: number | null;
  carbsPercentage?: number | null;
  fatPercentage?: number | null;
}): boolean {
  return [
    goal.proteinPercentage,
    goal.carbsPercentage,
    goal.fatPercentage,
  ].every((value) => finiteOrNull(value) !== null);
}

export function computeMacroTargets(input: MacroTargetInput): MacroTargets {
  const perKg: Record<Macro, number | null> = {
    protein: normalizeMacroPerKg('protein', input.proteinPerKg),
    carbs: normalizeMacroPerKg('carbs', input.carbsPerKg),
    fat: normalizeMacroPerKg('fat', input.fatPerKg),
  };
  const requestedBasis = isMacroWeightBasis(input.basis)
    ? input.basis
    : DEFAULT_MACRO_WEIGHT_BASIS;
  const anyPerKg = MACROS.some((m) => perKg[m] !== null);
  const referenceWeight = normalizeMacroReferenceWeight(
    input.referenceWeightKg
  );
  const weight: MacroBasisWeight = !anyPerKg
    ? { basisKg: null, basisUsed: null, leanMassFallback: false }
    : referenceWeight !== null
      ? // A fixed reference weight is already the kg of the chosen basis.
        {
          basisKg: referenceWeight,
          basisUsed: requestedBasis,
          leanMassFallback: false,
        }
      : resolveMacroBasisWeight(
          input.weightKg,
          input.bodyFatPercentage,
          requestedBasis
        );

  const stored: Record<Macro, number> = {
    protein: finiteOrNull(input.protein) ?? 0,
    carbs: finiteOrNull(input.carbs) ?? 0,
    fat: finiteOrNull(input.fat) ?? 0,
  };

  // A per-kg macro is locked: from the weight when there is one, else from
  // the grams saved with the goal (worked out from the weight at save time).
  const locked: Record<Macro, number | null> = {
    protein: null,
    carbs: null,
    fat: null,
  };
  for (const m of MACROS) {
    const value = perKg[m];
    if (value !== null) {
      locked[m] = weight.basisKg !== null ? value * weight.basisKg : stored[m];
    }
  }
  const lockedKcal = MACROS.reduce(
    (sum, m) => sum + (locked[m] ?? 0) * KCAL_PER_GRAM[m],
    0
  );

  const result: Record<Macro, number> = { protein: 0, carbs: 0, fat: 0 };
  const fiber = finiteOrNull(input.dietaryFiber) ?? 0;
  const availableKcal = Math.max(
    0,
    (finiteOrNull(input.calories) ?? 0) - fiber * 2
  );

  if (hasMacroPercentages(input)) {
    const pct: Record<Macro, number> = {
      protein: Number(input.proteinPercentage),
      carbs: Number(input.carbsPercentage),
      fat: Number(input.fatPercentage),
    };
    if (!anyPerKg) {
      for (const m of MACROS) {
        result[m] = (availableKcal * (pct[m] / 100)) / KCAL_PER_GRAM[m];
      }
    } else {
      const remainder = Math.max(0, availableKcal - lockedKcal);
      const free = MACROS.filter((m) => locked[m] === null);
      const pctSum = free.reduce((sum, m) => sum + Math.max(0, pct[m]), 0);
      for (const m of MACROS) {
        const lockedGrams = locked[m];
        if (lockedGrams !== null) {
          result[m] = lockedGrams;
        } else {
          const share =
            pctSum > 0 ? Math.max(0, pct[m]) / pctSum : 1 / free.length;
          result[m] = (remainder * share) / KCAL_PER_GRAM[m];
        }
      }
    }
  } else {
    for (const m of MACROS) result[m] = locked[m] ?? stored[m];
  }

  const resolution: MacroPerKgResolution | null = anyPerKg
    ? {
        protein_per_kg: perKg.protein,
        carbs_per_kg: perKg.carbs,
        fat_per_kg: perKg.fat,
        requested_basis: requestedBasis,
        basis_used: weight.basisUsed,
        basis_kg: weight.basisKg,
        weight_kg:
          weight.basisKg === null
            ? null
            : referenceWeight !== null
              ? referenceWeight
              : Number(input.weightKg),
        reference: referenceWeight !== null ? 'fixed' : 'logged',
        missing_weight: weight.basisKg === null,
        lean_mass_fallback: weight.leanMassFallback,
        locked_kcal: lockedKcal,
        available_kcal: availableKcal,
      }
    : null;

  return { ...result, perKg: resolution };
}
