import { apiCall } from '@/api/api';
import type { HeatmapResponse } from '@workspace/shared';

export interface HeatmapRequest {
  activities?: readonly string[];
  from?: string;
  to?: string;
  view?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
  maxCells?: number;
}

/** Query string for `GET /api/v2/heatmap`; empty filters are left out. */
export const heatmapQueryString = (request: HeatmapRequest): string => {
  const params = new URLSearchParams();
  if (request.activities && request.activities.length > 0) {
    params.set('activities', request.activities.join(','));
  }
  if (request.from) params.set('from', request.from);
  if (request.to) params.set('to', request.to);
  if (request.view) {
    params.set('minLat', String(request.view.minLat));
    params.set('maxLat', String(request.view.maxLat));
    params.set('minLon', String(request.view.minLon));
    params.set('maxLon', String(request.view.maxLon));
  }
  if (request.maxCells) params.set('maxCells', String(request.maxCells));
  const query = params.toString();
  return query ? `?${query}` : '';
};

/**
 * The person's own heatmap. The server refuses it when acting for someone
 * else, so callers do not pass a user id.
 */
export const loadHeatmap = async (
  request: HeatmapRequest
): Promise<HeatmapResponse> =>
  apiCall(`/v2/heatmap${heatmapQueryString(request)}`, { method: 'GET' });
