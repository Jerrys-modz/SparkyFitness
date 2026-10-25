import {
  HEART_RATE_ZONE_COLORS,
  HR_ZONE_COUNT,
  defaultHeartRateZones,
} from '@workspace/shared';

/**
 * Charts color a heart rate line by the person's five zones (easy to hard).
 * Everything here starts from their own floors (`resolveHeartRateZones` on the
 * server, returned by `GET /api/v2/heart-rate-zones`), never a fixed bpm.
 */

/** Zone floors to use when the person's own have not loaded. */
export const fallbackZoneFloors = (): number[] =>
  defaultHeartRateZones().floors;

/** Where zones 2 to 5 begin: the four bpm values where a line changes color. */
export const zoneEdges = (floors: readonly number[]): number[] =>
  (floors.length === HR_ZONE_COUNT ? floors : fallbackZoneFloors()).slice(1);

/** Zone color index for a reading; below zone 1 draws as zone 1. */
const colorIndex = (bpm: number, edges: readonly number[]): number => {
  let index = 0;
  edges.forEach((edge, i) => {
    if (bpm >= edge) index = i + 1;
  });
  return index;
};

export interface GradientStop {
  offset: number;
  color: string;
}

/**
 * Stops for a vertical line gradient that colors each height by its zone. The
 * gradient spans the line's own highest and lowest reading, so offsets are
 * measured from that range. A flat line has no height to span; it gets one
 * solid color (a single stop pair at the same color).
 */
export function zoneGradientStops(
  minBpm: number,
  maxBpm: number,
  edges: readonly number[]
): GradientStop[] {
  const color = (index: number) =>
    HEART_RATE_ZONE_COLORS[index] ?? HEART_RATE_ZONE_COLORS[0];
  if (!(maxBpm > minBpm)) {
    const solid = color(colorIndex(maxBpm, edges));
    return [
      { offset: 0, color: solid },
      { offset: 1, color: solid },
    ];
  }
  const span = maxBpm - minBpm;
  const stops: GradientStop[] = [
    { offset: 0, color: color(colorIndex(maxBpm, edges)) },
  ];
  // Walk down from the top: each edge inside the range is a hard edge
  edges
    .map((edge, i) => ({ edge, index: i + 1 }))
    .reverse()
    .forEach(({ edge, index }) => {
      if (edge <= minBpm || edge > maxBpm) return;
      const offset = (maxBpm - edge) / span;
      stops.push({ offset, color: color(index) });
      stops.push({ offset, color: color(index - 1) });
    });
  stops.push({ offset: 1, color: color(colorIndex(minBpm, edges)) });
  return stops;
}

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
