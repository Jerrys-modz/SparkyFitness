// Body-fat % goal (stored in `onboarding_data.target_body_fat_percentage`,
// next to the goal weight). Web, mobile and the server all validate and
// derive from these helpers so the range and the estimate never drift.

/**
 * Lowest and highest target the app accepts. Below ~3% is under essential fat
 * for anyone; above 60% is not a goal anyone sets on purpose and is more likely
 * a typing slip.
 */
export const BODY_FAT_GOAL_MIN_PERCENT = 3;
export const BODY_FAT_GOAL_MAX_PERCENT = 60;

/** Rounds to the stored precision (`NUMERIC(4,1)`, one decimal). */
export function roundBodyFatPercent(value: number): number {
  return Math.round(value * 10) / 10;
}

/** True for a finite target inside the accepted range, after rounding. */
export function isValidBodyFatGoal(value: number): boolean {
  if (!Number.isFinite(value)) return false;
  const rounded = roundBodyFatPercent(value);
  return (
    rounded >= BODY_FAT_GOAL_MIN_PERCENT && rounded <= BODY_FAT_GOAL_MAX_PERCENT
  );
}

/**
 * Reads a stored target. The column is NUMERIC, so node-postgres sends it as a
 * string; anything missing, unparseable or out of range reads as no goal.
 */
export function parseBodyFatGoal(
  value: string | number | null | undefined
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return isValidBodyFatGoal(n) ? roundBodyFatPercent(n) : null;
}

/**
 * Weight that reaches `targetBodyFatPercent` if lean mass stays what it is
 * now: lean mass = weight × (1 − bf%), implied weight = lean mass ÷ (1 − target).
 * An estimate only: lean mass changes during a cut or a bulk, and body-fat
 * readings vary a lot with the measuring method. Returns null for a missing
 * or impossible input. Weight is in whatever unit is passed; the result uses it.
 */
export function impliedGoalWeight(
  currentWeight: number | null | undefined,
  currentBodyFatPercent: number | null | undefined,
  targetBodyFatPercent: number | null | undefined
): number | null {
  if (
    currentWeight == null ||
    currentBodyFatPercent == null ||
    targetBodyFatPercent == null ||
    !Number.isFinite(currentWeight) ||
    currentWeight <= 0 ||
    !Number.isFinite(currentBodyFatPercent) ||
    currentBodyFatPercent <= 0 ||
    currentBodyFatPercent >= 100 ||
    !isValidBodyFatGoal(targetBodyFatPercent)
  ) {
    return null;
  }
  const leanMass = currentWeight * (1 - currentBodyFatPercent / 100);
  return leanMass / (1 - targetBodyFatPercent / 100);
}
