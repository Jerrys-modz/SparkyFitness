/**
 * Protein and fat goals set in grams per kg of body weight (or of lean mass).
 *
 * A goal row (`user_goals`, `goal_presets`) may hold `protein_per_kg` and/or
 * `fat_per_kg` with a `macro_per_kg_basis`. The grams follow the latest weight
 * measured on or before the diary day, so a target set by hand no longer stays
 * behind while weight goes down. One function works out a day's macro grams
 * for the server, the web Goals preview and the mobile Goals preview.
 *
 * Remaining calories (#1955): a per-kg macro is locked at its grams. When the
 * goal is in percentage mode, the calories left after the locked macros (and
 * after the fibre allowance the percentage maths already subtracts) go to the
 * macros that are not locked, in proportion to their percentages. With both
 * protein and fat per kg, carbs take all of the remainder. When the goal is in
 * gram mode, carbs and any unlocked fat keep the grams the person typed.
 */

export const MACRO_WEIGHT_BASES = ['body_weight', 'lean_mass'] as const;
export type MacroWeightBasis = (typeof MACRO_WEIGHT_BASES)[number];

export const DEFAULT_MACRO_WEIGHT_BASIS: MacroWeightBasis = 'body_weight';

/** Accepted g/kg values; the database CHECK constraints use the same bounds. */
export const MACRO_PER_KG_LIMITS = {
  protein: { min: 0.1, max: 5 },
  fat: { min: 0.1, max: 3 },
} as const;

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
  macro: keyof typeof MACRO_PER_KG_LIMITS,
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
  fatPerKg?: number | null;
  basis?: MacroWeightBasis | null;
  /** Latest weight measured on or before the day, in kg. */
  weightKg?: number | null;
  /** Latest body-fat percentage measured on or before the day. */
  bodyFatPercentage?: number | null;
}

/** How a day's per-kg goal was resolved; sent with the day's goals. */
export interface MacroPerKgResolution {
  protein_per_kg: number | null;
  fat_per_kg: number | null;
  requested_basis: MacroWeightBasis;
  basis_used: MacroWeightBasis | null;
  basis_kg: number | null;
  weight_kg: number | null;
  /** No weight logged on or before the day: stored grams were used. */
  missing_weight: boolean;
  /** Lean mass chosen without a body-fat reading: body weight was used. */
  lean_mass_fallback: boolean;
}

export interface MacroTargets {
  protein: number;
  carbs: number;
  fat: number;
  /** Null when neither protein nor fat is set per kg. */
  perKg: MacroPerKgResolution | null;
}

const finiteOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

/** True when the goal sets protein or fat per kg. */
export function hasMacroPerKg(goal: {
  protein_per_kg?: unknown;
  fat_per_kg?: unknown;
}): boolean {
  return (
    normalizeMacroPerKg('protein', goal.protein_per_kg) !== null ||
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
  const proteinPerKg = normalizeMacroPerKg('protein', input.proteinPerKg);
  const fatPerKg = normalizeMacroPerKg('fat', input.fatPerKg);
  const requestedBasis = isMacroWeightBasis(input.basis)
    ? input.basis
    : DEFAULT_MACRO_WEIGHT_BASIS;
  const anyPerKg = proteinPerKg !== null || fatPerKg !== null;
  const weight = anyPerKg
    ? resolveMacroBasisWeight(
        input.weightKg,
        input.bodyFatPercentage,
        requestedBasis
      )
    : { basisKg: null, basisUsed: null, leanMassFallback: false };

  const storedProtein = finiteOrNull(input.protein) ?? 0;
  const storedCarbs = finiteOrNull(input.carbs) ?? 0;
  const storedFat = finiteOrNull(input.fat) ?? 0;

  // A per-kg macro is locked: from the weight when there is one, else from
  // the grams saved with the goal (worked out from the weight at save time).
  const lockedProtein =
    proteinPerKg === null
      ? null
      : weight.basisKg !== null
        ? proteinPerKg * weight.basisKg
        : storedProtein;
  const lockedFat =
    fatPerKg === null
      ? null
      : weight.basisKg !== null
        ? fatPerKg * weight.basisKg
        : storedFat;

  let protein: number;
  let carbs: number;
  let fat: number;

  if (hasMacroPercentages(input)) {
    const fiber = finiteOrNull(input.dietaryFiber) ?? 0;
    const adjustedCalories = Math.max(
      0,
      (finiteOrNull(input.calories) ?? 0) - fiber * 2
    );
    const proteinPct = Number(input.proteinPercentage);
    const carbsPct = Number(input.carbsPercentage);
    const fatPct = Number(input.fatPercentage);
    if (lockedProtein === null && lockedFat === null) {
      protein = (adjustedCalories * (proteinPct / 100)) / 4;
      carbs = (adjustedCalories * (carbsPct / 100)) / 4;
      fat = (adjustedCalories * (fatPct / 100)) / 9;
    } else {
      const remainder = Math.max(
        0,
        adjustedCalories - (lockedProtein ?? 0) * 4 - (lockedFat ?? 0) * 9
      );
      const free: { key: 'protein' | 'carbs' | 'fat'; pct: number }[] = [];
      if (lockedProtein === null)
        free.push({ key: 'protein', pct: proteinPct });
      free.push({ key: 'carbs', pct: carbsPct });
      if (lockedFat === null) free.push({ key: 'fat', pct: fatPct });
      const pctSum = free.reduce((sum, m) => sum + Math.max(0, m.pct), 0);
      const share = (pct: number) =>
        pctSum > 0 ? Math.max(0, pct) / pctSum : 1 / free.length;
      const kcalFor = (key: 'protein' | 'carbs' | 'fat') => {
        const entry = free.find((m) => m.key === key);
        return entry ? remainder * share(entry.pct) : 0;
      };
      protein = lockedProtein ?? kcalFor('protein') / 4;
      carbs = kcalFor('carbs') / 4;
      fat = lockedFat ?? kcalFor('fat') / 9;
    }
  } else {
    protein = lockedProtein ?? storedProtein;
    carbs = storedCarbs;
    fat = lockedFat ?? storedFat;
  }

  const perKg: MacroPerKgResolution | null = anyPerKg
    ? {
        protein_per_kg: proteinPerKg,
        fat_per_kg: fatPerKg,
        requested_basis: requestedBasis,
        basis_used: weight.basisUsed,
        basis_kg: weight.basisKg,
        weight_kg: weight.basisKg === null ? null : Number(input.weightKg),
        missing_weight: weight.basisKg === null,
        lean_mass_fallback: weight.leanMassFallback,
      }
    : null;

  return { protein, carbs, fat, perKg };
}
