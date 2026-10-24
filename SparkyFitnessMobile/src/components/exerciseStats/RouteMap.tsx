import React from 'react';
import type { GpsTrackPoint, RouteStop } from '@workspace/shared';
import { canShowRouteMap } from '../../utils/routeMapSupport';
import RouteLine from './RouteLine';
import RouteTileMap from './RouteTileMap';

interface RouteMapProps {
  points: readonly Pick<GpsTrackPoint, 'lat' | 'lon'>[];
  accessibilityLabel: string;
  /** Marked on a real map only; the plain line has nowhere to draw them (the stops list covers it). */
  stops?: readonly Pick<RouteStop, 'kind' | 'name' | 'lat' | 'lon'>[];
}

/**
 * A route (a cardio session's or a saved one): over a real map where this build can draw one,
 * otherwise as a plain line.
 */
const RouteMap: React.FC<RouteMapProps> = ({ stops, ...props }) =>
  canShowRouteMap() ? (
    <RouteTileMap {...props} stops={stops} />
  ) : (
    <RouteLine {...props} />
  );

export default RouteMap;
