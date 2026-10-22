import {
  compareResponseSchema,
  type CompareMetricKey,
  type CompareResponse,
} from '@workspace/shared';
import type { CompareMode } from '../../utils/compareQuestion';
import { apiFetch } from './apiClient';

export interface CompareParams {
  a: CompareMetricKey;
  b: CompareMetricKey;
  mode: CompareMode;
  timing: -1 | 0 | 1;
  start: string;
  end: string;
}

/**
 * Asks the server how two things move together. The response is parsed so a
 * contract drift fails loudly instead of surfacing as undefined fields.
 */
export async function fetchCompare(p: CompareParams): Promise<CompareResponse> {
  const query = [
    ['a', p.a],
    ['b', p.b],
    ['mode', p.mode],
    ['timing', String(p.timing)],
    ['start', p.start],
    ['end', p.end],
  ]
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const raw = await apiFetch<unknown>({
    endpoint: `/api/v2/reports/compare?${query}`,
    serviceName: 'compareApi',
    operation: 'compare two things',
  });
  return compareResponseSchema.parse(raw);
}
