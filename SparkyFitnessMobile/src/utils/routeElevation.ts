import { haversineMeters, type RoutePoint } from '@workspace/shared';
import { METERS_PER_KM, METERS_PER_MILE } from './gpsRecording';
import type { DistanceUnit } from './routeDisplay';

/** One reading of the profile: distance and height, in the display units. */
export interface ElevationSample {
  distance: number;
  elevation: number;
}

export interface ElevationProfile {
  samples: ElevationSample[];
  /** Lowest and highest reading, in the display height unit. */
  minElevation: number;
  maxElevation: number;
}

const METERS_TO_FEET = 3.28084;
/** A profile needs at least this share of the points to carry an altitude. */
const MIN_COVERAGE = 0.5;
/** The most samples drawn; a 2000-point route is far denser than a chart. */
const MAX_SAMPLES = 160;

/**
 * Whether the points carry enough altitude to draw a profile. A drawn route
 * has none, and a GPX file may carry it on only a few points; nothing is
 * filled in for the gaps.
 */
export function hasRouteElevation(points: readonly RoutePoint[]): boolean {
  if (points.length < 2) return false;
  const withAltitude = points.filter((p) => p.alt !== undefined).length;
  return withAltitude >= 2 && withAltitude / points.length >= MIN_COVERAGE;
}

/**
 * Height against distance along the route, in the person's unit (km and
 * metres, or miles and feet). Only points that have an altitude are plotted,
 * at their true distance along the whole line. Null when the route has no
 * usable elevation.
 */
export function routeElevationProfile(
  points: readonly RoutePoint[],
  unit: DistanceUnit
): ElevationProfile | null {
  if (!hasRouteElevation(points)) return null;

  const distanceDivisor = unit === 'miles' ? METERS_PER_MILE : METERS_PER_KM;
  const heightFactor = unit === 'miles' ? METERS_TO_FEET : 1;

  const all: ElevationSample[] = [];
  let along = 0;
  points.forEach((point, index) => {
    if (index > 0) along += haversineMeters(points[index - 1], point);
    if (point.alt === undefined) return;
    all.push({
      distance: along / distanceDivisor,
      elevation: point.alt * heightFactor,
    });
  });

  const samples = thin(all, MAX_SAMPLES);
  const heights = samples.map((s) => s.elevation);
  return {
    samples,
    minElevation: Math.min(...heights),
    maxElevation: Math.max(...heights),
  };
}

/** Evenly keeps `limit` samples, always the first and the last. */
function thin(
  samples: readonly ElevationSample[],
  limit: number
): ElevationSample[] {
  if (samples.length <= limit) return samples.slice();
  const kept: ElevationSample[] = [];
  const step = (samples.length - 1) / (limit - 1);
  for (let i = 0; i < limit; i++) kept.push(samples[Math.round(i * step)]);
  return kept;
}
