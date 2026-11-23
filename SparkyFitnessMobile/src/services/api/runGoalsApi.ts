import type {
  GetRunGoalsResponse,
  UpsertRunGoalsBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { cachedRead } from '../../offline/cachedRead';
import {
  CACHE_COLLECTIONS,
  SINGLE_DOCUMENT_KEY,
} from '../../offline/collections';

const SERVICE = 'Run Goals API';

/** The weekly distance target and race, with this week's running and the days to the race. */
export const fetchRunGoalsFromServer = (): Promise<GetRunGoalsResponse> =>
  apiFetch<GetRunGoalsResponse>({
    endpoint: '/api/v2/run-goals',
    serviceName: SERVICE,
    operation: 'fetch run goals',
  });

export const fetchRunGoals = (): Promise<GetRunGoalsResponse> =>
  cachedRead(
    CACHE_COLLECTIONS.runGoals,
    SINGLE_DOCUMENT_KEY,
    fetchRunGoalsFromServer
  );

/** Sets the fields sent and clears the ones sent as null. */
export const saveRunGoals = (
  body: UpsertRunGoalsBody
): Promise<GetRunGoalsResponse> =>
  apiFetch<GetRunGoalsResponse>({
    endpoint: '/api/v2/run-goals',
    serviceName: SERVICE,
    operation: 'save run goals',
    method: 'PUT',
    body,
  });
