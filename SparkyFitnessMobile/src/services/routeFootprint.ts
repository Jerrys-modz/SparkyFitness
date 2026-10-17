import type { Route } from '@workspace/shared';
import { fetchRoute, fetchRoutes } from './api/routeApi';
import { addLog } from './LogService';
import { buildRouteFootprint, nearbyRouteIds } from '../utils/routeFootprint';

/**
 * The offline-map paths for `route`: the person's other saved routes that pass
 * near it (see `buildRouteFootprint`). Best effort: any failure, or no other
 * route nearby, gives an empty footprint and the route is sent without one.
 */
export async function loadRouteFootprint(
  route: Pick<Route, 'id' | 'points'>
): Promise<number[][]> {
  try {
    const { routes } = await fetchRoutes();
    const ids = nearbyRouteIds(route, routes);
    if (ids.length === 0) return [];
    const fetched = await Promise.allSettled(ids.map((id) => fetchRoute(id)));
    const others = fetched.flatMap((result) =>
      result.status === 'fulfilled' ? [result.value.route] : []
    );
    return buildRouteFootprint(route, others);
  } catch (error) {
    addLog(`[Watch Route] No offline map for ${route.id}: ${error}`, 'WARNING');
    return [];
  }
}
