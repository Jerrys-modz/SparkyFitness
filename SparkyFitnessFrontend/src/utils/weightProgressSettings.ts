import {
  DEFAULT_WEIGHT_PROGRESS_SETTINGS,
  parseWeightProgressSettings,
  type WeightProgressSettings,
} from '@workspace/shared';

// The weight progress card's own choices, kept in this browser only (the phone
// keeps its own on the device) and per person, so a browser a family shares
// never shows one person's start point or milestones to another.

const STORAGE_PREFIX = 'sparky.weightProgress.v1';
const storageKey = (userId: string) => `${STORAGE_PREFIX}.${userId}`;

/** The person's stored choices; defaults when none or unreadable. */
export function loadWeightProgressSettings(
  userId: string | null | undefined
): WeightProgressSettings {
  if (!userId) return DEFAULT_WEIGHT_PROGRESS_SETTINGS;
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    if (!raw) return DEFAULT_WEIGHT_PROGRESS_SETTINGS;
    return parseWeightProgressSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_WEIGHT_PROGRESS_SETTINGS;
  }
}

export function saveWeightProgressSettings(
  userId: string | null | undefined,
  settings: WeightProgressSettings
): void {
  if (!userId) return;
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(settings));
  } catch {
    // Storage blocked: the choice lasts for this tab only.
  }
}
