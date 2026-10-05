import type { FreeExercise } from '../freeexercisedb/FreeExerciseDBService.js';

const STOP_WORDS = new Set(['a', 'an', 'and', 'the', 'with', 'to', 'on', 'of']);
const EQUIPMENT_WORDS = new Set([
  'barbell',
  'dumbbell',
  'cable',
  'machine',
  'kettlebell',
  'band',
  'smith',
  'ez',
  'lever',
]);
// Spellings that differ between Hevy and free-exercise-db.
const ALIASES: Record<string, string> = {
  bicep: 'biceps',
  tricep: 'triceps',
  lat: 'lats',
  quad: 'quadriceps',
  ab: 'abdominals',
  abs: 'abdominals',
  db: 'dumbbell',
  bb: 'barbell',
  chinup: 'chin',
  pullup: 'pull',
  pushup: 'push',
};

function tokens(name: string): string[] {
  const out = new Set<string>();
  for (const raw of name.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || STOP_WORDS.has(raw)) continue;
    let word = raw;
    // Plural to singular, but keep words that end in "ss" ("press") and the
    // anatomy terms that are plural by nature.
    if (
      word.length > 3 &&
      word.endsWith('s') &&
      !word.endsWith('ss') &&
      !['biceps', 'triceps', 'lats', 'abs', 'glutes'].includes(word)
    ) {
      word = word.slice(0, -1);
    }
    out.add(ALIASES[word] ?? word);
  }
  return [...out];
}

function equipmentOf(words: string[]): Set<string> {
  return new Set(words.filter((w) => EQUIPMENT_WORDS.has(w)));
}

/**
 * Best free-exercise-db entry for a Hevy exercise title, or null when nothing
 * is a confident match. Deliberately strict: a missing guide is better than
 * the wrong one. Needs a high word overlap and the same equipment on both
 * sides ("Bench Press (Barbell)" must not take the dumbbell version).
 */
export function findGuideMatch(
  title: string,
  candidates: readonly FreeExercise[],
  minScore = 0.7
): FreeExercise | null {
  const wanted = tokens(title);
  if (wanted.length === 0) return null;
  const wantedEquipment = equipmentOf(wanted);
  let best: { exercise: FreeExercise; score: number; extra: number } | null =
    null;
  for (const exercise of candidates) {
    const have = tokens(exercise.name);
    if (have.length === 0) continue;
    const haveEquipment = equipmentOf(have);
    // Free-exercise-db lists equipment separately for some entries.
    if (exercise.equipment) {
      for (const w of tokens(exercise.equipment)) {
        if (EQUIPMENT_WORDS.has(w)) haveEquipment.add(w);
      }
    }
    if (
      wantedEquipment.size > 0 &&
      haveEquipment.size > 0 &&
      ![...wantedEquipment].some((w) => haveEquipment.has(w))
    ) {
      continue;
    }
    // The equipment field counts as part of the name for coverage, so
    // "Romanian Deadlift" (equipment: barbell) satisfies "(Barbell)".
    const haveSet = new Set([...have, ...haveEquipment]);
    const shared = wanted.filter((w) => haveSet.has(w)).length;
    const score = (2 * shared) / (wanted.length + haveSet.size);
    // Every word of the Hevy title must appear in the candidate.
    if (shared < wanted.length || score < minScore) continue;
    const extra = haveSet.size - shared;
    if (
      !best ||
      score > best.score ||
      (score === best.score && extra < best.extra)
    ) {
      best = { exercise, score, extra };
    }
  }
  return best?.exercise ?? null;
}
