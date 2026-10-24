import type { RouteStopKind } from '@workspace/shared';

/** Marker colours on the route map; fixed so a kind reads the same everywhere. */
export const ROUTE_STOP_COLORS: Record<RouteStopKind, string> = {
  water: '#2f80ed',
  toilets: '#8e44ad',
  cafe: '#e67e22',
  viewpoint: '#27ae60',
};

/** The most stops listed and put on the map; the counts always cover all of them. */
export const ROUTE_STOPS_LIST_LIMIT = 25;
export const ROUTE_STOPS_MAP_LIMIT = 60;
