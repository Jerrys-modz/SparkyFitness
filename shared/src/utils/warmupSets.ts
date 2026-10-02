import {
  isWarmupOrDropSetType,
  type DropSetWeightUnit,
} from "./dropSetCalculator.ts";

const KG_PER_LB = 0.45359237;

/** Smallest loadable step per display unit: a 2.5 kg or 5 lb plate pair. */
export const WARMUP_ROUND_INCREMENT = { kg: 2.5, lbs: 5 } as const;

/** The empty bar the first warm-up uses: 20 kg, or 45 lb. */
export const WARMUP_BAR_WEIGHT = { kg: 20, lbs: 45 } as const;

/** Rest after a warm-up set. Short on purpose: it is not a working set. */
export const WARMUP_REST_SEC = 60;

/** The ramp after the bar: share of the working weight, and reps. */
const WARMUP_RAMP = [
  { fraction: 0.5, reps: 5 },
  { fraction: 0.7, reps: 3 },
  { fraction: 0.85, reps: 1 },
] as const;

const BAR_REPS = 10;

export interface WarmupSet {
  weightKg: number;
  reps: number;
}

/**
 * Ramping warm-up sets for a first working set of `workingWeightKg`: the bar
 * for 10, then 50% for 5, 70% for 3 and 85% for 1. Weights are rounded in the
 * lifter's display unit so they land on loadable plates, and any step that
 * would not climb (at or under the previous one, or not under the working
 * weight) is dropped, so a light working weight gets a shorter ramp. No
 * warm-ups at all when the working weight is not above the bar.
 */
export function calculateWarmupSets(
  workingWeightKg: number,
  unit: DropSetWeightUnit,
): WarmupSet[] {
  if (!Number.isFinite(workingWeightKg) || workingWeightKg <= 0) return [];
  const working = unit === "kg" ? workingWeightKg : workingWeightKg / KG_PER_LB;
  const bar = WARMUP_BAR_WEIGHT[unit];
  const step = WARMUP_ROUND_INCREMENT[unit];
  if (working <= bar) return [];

  const sets: { weight: number; reps: number }[] = [
    { weight: bar, reps: BAR_REPS },
  ];
  for (const { fraction, reps } of WARMUP_RAMP) {
    const weight = Math.round((working * fraction) / step) * step;
    const previous = sets[sets.length - 1]!.weight;
    if (weight > previous && weight < working) sets.push({ weight, reps });
  }
  return sets.map(({ weight, reps }) => ({
    weightKg:
      unit === "kg" ? weight : Math.round(weight * KG_PER_LB * 10000) / 10000,
    reps,
  }));
}

export interface WarmupBaseCandidate {
  weight?: number | null;
  set_type?: string | null;
}

/**
 * Index of the set warm-ups are built from: the first working set (not a
 * warm-up or drop set). `effectiveWeight` lets a caller supply a placeholder
 * weight for a set the user has not typed into. Returns -1 when that set has
 * no weight, since there is nothing to ramp towards.
 */
export function findWarmupBaseIndex<T extends WarmupBaseCandidate>(
  sets: readonly T[],
  effectiveWeight: (set: T) => number | null | undefined = (set) => set.weight,
): number {
  const index = sets.findIndex((set) => !isWarmupOrDropSetType(set.set_type));
  if (index < 0) return -1;
  const weight = effectiveWeight(sets[index]!);
  return weight != null && weight > 0 ? index : -1;
}
