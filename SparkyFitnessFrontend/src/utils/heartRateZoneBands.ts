import type { GradientStop } from '@workspace/shared';

/**
 * Charts color a heart rate line by the person's zones: five bands, or four
 * tiers when they chose that. The stops come from `zoneGradientStops` in
 * `@workspace/shared` (shared with the mobile charts), over the person's own
 * zones, never fixed bpm.
 */

/**
 * The `stroke` for a line colored by `stops`. A gradient does not paint a path
 * with no height (a flat series), so a single-color result is used directly.
 */
export function zoneStroke(
  stops: readonly GradientStop[],
  gradientId: string
): string {
  const first = stops[0];
  if (!first) return 'none';
  return stops.every((stop) => stop.color === first.color)
    ? first.color
    : `url(#${gradientId})`;
}
