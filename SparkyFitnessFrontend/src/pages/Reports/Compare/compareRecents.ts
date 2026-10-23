import {
  type CompareQuestion,
  knownCompareQuestions,
  withRecentQuestion,
} from '@workspace/shared';

// The last few questions asked, kept in this browser only (as the phone keeps
// them on the device), so the start state can offer them again.
const STORAGE_KEY = 'sparky.compareRecentQuestions.v1';

/**
 * The stored recents this build still knows. Since-habit questions are not
 * offered on the web yet, so a stored one is dropped too.
 */
export function loadRecentQuestions(): CompareQuestion[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return knownCompareQuestions(JSON.parse(raw) as unknown).filter(
      (q) => q.choice !== 'sinceHabit'
    );
  } catch {
    // Storage blocked or the value is not JSON.
    return [];
  }
}

/** Puts `q` first, keeps the newest five, and returns the new list. */
export function saveRecentQuestion(q: CompareQuestion): CompareQuestion[] {
  const next = withRecentQuestion(loadRecentQuestions(), q);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Keep the list for this tab only.
  }
  return next;
}
