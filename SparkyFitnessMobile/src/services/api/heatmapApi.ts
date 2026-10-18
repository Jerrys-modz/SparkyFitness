import type { HeatmapResponse } from '@workspace/shared';
import { apiFetch } from './apiClient';

export interface HeatmapParams {
  /** Comma-separable kinds; all when empty. */
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

/** Builds the query string for `GET /api/v2/heatmap`. */
export function heatmapQuery(params: HeatmapParams): string {
  const query = new URLSearchParams();
  if (params.activities && params.activities.length > 0) {
    query.set('activities', params.activities.join(','));
  }
  if (params.from) query.set('from', params.from);
  if (params.to) query.set('to', params.to);
  if (params.view) {
    query.set('minLat', String(params.view.minLat));
    query.set('maxLat', String(params.view.maxLat));
    query.set('minLon', String(params.view.minLon));
    query.set('maxLon', String(params.view.maxLon));
  }
  if (params.maxCells) query.set('maxCells', String(params.maxCells));
  const text = query.toString();
  return text ? `?${text}` : '';
}

/** Where the person has run, walked or ridden, as a density grid. */
export const fetchHeatmap = (params: HeatmapParams): Promise<HeatmapResponse> =>
  apiFetch<HeatmapResponse>({
    endpoint: `/api/v2/heatmap${heatmapQuery(params)}`,
    serviceName: 'Heatmap API',
    operation: 'fetch heatmap',
    // The first request after a change builds the grid on the server.
    timeoutMs: 60_000,
  });
