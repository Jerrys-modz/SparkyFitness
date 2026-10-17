import { useMemo } from 'react';
import {
  distanceToStartMeters,
  reachedRoute,
  type LatLon,
} from '../utils/routeStart';

/**
 * How far the newest recorded position is from the start of the chosen route,
 * or null when there is nothing to say: no route, no fix yet, or the track has
 * already come onto the route line once (after that the person is following it,
 * and wandering off again is not "getting to the start").
 */
export function useRouteStartDistance(
  route: readonly LatLon[] | undefined,
  track: readonly LatLon[]
): number | null {
  return useMemo(() => {
    if (!route || route.length < 2 || track.length === 0) return null;
    if (reachedRoute(track, route)) return null;
    return distanceToStartMeters(track[track.length - 1], route);
  }, [route, track]);
}
