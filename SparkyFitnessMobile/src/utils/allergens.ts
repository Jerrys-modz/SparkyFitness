export const COMMON_ALLERGENS = [
  'gluten',
  'wheat',
  'milk',
  'eggs',
  'peanuts',
  'tree nuts',
  'soy',
  'fish',
  'shellfish',
  'crustaceans',
  'sesame',
  'celery',
  'mustard',
  'lupin',
  'sulphites',
] as const;

export function normalizeAllergen(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Returns the food's allergens and traces that the user tracks. Matching is
 * case-insensitive, mirroring web's AllergenBadges.
 */
export function matchAllergens(
  tracked: readonly string[] | undefined,
  allergens?: readonly string[] | null,
  traces?: readonly string[] | null
): { allergens: string[]; traces: string[] } {
  if (!tracked?.length) return { allergens: [], traces: [] };
  const trackedSet = new Set(tracked.map(normalizeAllergen));
  const keep = (list?: readonly string[] | null) =>
    (list ?? []).filter((a) => trackedSet.has(normalizeAllergen(a)));
  return { allergens: keep(allergens), traces: keep(traces) };
}
