import type {
  HealthDataDeletionsRequest,
  HealthDataDeletionsResponse,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import type { ServerConfig } from '../storage';

/**
 * Asks the server to remove imported records whose source sample was deleted
 * in the phone's health store (#3489). Ids the server never stored are
 * ignored. A server without the endpoint answers 404.
 */
export const postHealthDataDeletions = (
  body: HealthDataDeletionsRequest,
  serverConfig?: ServerConfig
): Promise<HealthDataDeletionsResponse> =>
  apiFetch<HealthDataDeletionsResponse>({
    endpoint: '/api/health-data/deletions',
    serviceName: 'Health Data API',
    operation: 'remove deleted health samples',
    method: 'POST',
    body,
    serverConfig,
  });
