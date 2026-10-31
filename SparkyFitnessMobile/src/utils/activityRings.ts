import {
  ACTIVITY_RING_KEYS,
  APPLE_STYLE_RINGS,
  type ActivityRingKey,
  type ActivityRingStyle,
} from '../constants/activityRings';

export type ActivityRingValue = { current: number; goal: number };

export type ActivityRingData = ActivityRingValue & {
  key: ActivityRingKey;
  /** 0 to 1 and beyond; the ring itself caps what it draws. */
  progress: number;
};

/**
 * The rings a style draws. A custom pick is reconciled against the registry (unknown keys
 * dropped, registry order kept) and an empty one falls back to the Apple pair, so the
 * card never renders with nothing in it.
 */
export function resolveActivityRingKeys(
  style: ActivityRingStyle,
  customKeys: readonly string[]
): ActivityRingKey[] {
  if (style === 'apple') return [...APPLE_STYLE_RINGS];
  const picked = ACTIVITY_RING_KEYS.filter((key) => customKeys.includes(key));
  return picked.length > 0 ? picked : [...APPLE_STYLE_RINGS];
}

/** A ring with no goal reads as empty rather than full: there is nothing to close. */
export function buildActivityRings(
  keys: readonly ActivityRingKey[],
  values: Record<ActivityRingKey, ActivityRingValue>
): ActivityRingData[] {
  return keys.map((key) => {
    const { current, goal } = values[key];
    return { key, current, goal, progress: goal > 0 ? current / goal : 0 };
  });
}
