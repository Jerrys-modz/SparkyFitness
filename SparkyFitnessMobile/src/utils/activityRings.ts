import {
  ACTIVITY_RING_KEYS,
  APPLE_STYLE_RINGS,
  GOOGLE_STYLE_RINGS,
  STAND_HOURS_SUPPORTED,
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
 * dropped, registry order kept, Stand dropped off iOS) and an empty one falls back to the
 * Apple set, so the card never renders with nothing in it.
 */
export function resolveActivityRingKeys(
  style: ActivityRingStyle,
  customKeys: readonly string[]
): ActivityRingKey[] {
  const available = (key: ActivityRingKey): boolean =>
    key !== 'stand' || STAND_HOURS_SUPPORTED;
  const apple = APPLE_STYLE_RINGS.filter(available);
  if (style === 'apple') return [...apple];
  if (style === 'google') return [...GOOGLE_STYLE_RINGS];
  const picked = ACTIVITY_RING_KEYS.filter(
    (key) => customKeys.includes(key) && available(key)
  );
  return picked.length > 0 ? picked : [...apple];
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

/** 150 moderate-equivalent minutes a week, spread over seven days and rounded. */
export const ACTIVE_POINTS_DAILY_GOAL = 22;

/**
 * Active points from a day's time in heart rate zones: a minute in zones 2-3 (moderate)
 * is one point and a minute in zones 4-5 (vigorous) is two, the way weekly activity
 * guidance counts vigorous minutes double. An approximation of other apps' scores, and
 * zero for a day with no recorded heart rate, so the card labels it as active points.
 */
export function activePointsFromZones(
  rows: readonly { zone: number; seconds: number }[] | null
): number {
  if (!rows) return 0;
  let points = 0;
  for (const row of rows) {
    const minutes = Math.max(0, row.seconds) / 60;
    if (row.zone === 2 || row.zone === 3) points += minutes;
    else if (row.zone === 4 || row.zone === 5) points += minutes * 2;
  }
  return Math.round(points);
}
