import type {
  CreateFitnessTestBody,
  FitnessTestListResponse,
  FitnessTestResponse,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { cachedRead } from '../../offline/cachedRead';
import {
  CACHE_COLLECTIONS,
  SINGLE_DOCUMENT_KEY,
} from '../../offline/collections';

const SERVICE = 'Fitness Test API';

/** The person's fitness tests, newest first. */
export const fetchFitnessTestsFromServer =
  (): Promise<FitnessTestListResponse> =>
    apiFetch<FitnessTestListResponse>({
      endpoint: '/api/v2/fitness-tests',
      serviceName: SERVICE,
      operation: 'fetch fitness tests',
    });

export const fetchFitnessTests = (): Promise<FitnessTestListResponse> =>
  cachedRead(
    CACHE_COLLECTIONS.fitnessTests,
    SINGLE_DOCUMENT_KEY,
    fetchFitnessTestsFromServer
  );

/** Saves a test; the server works the result and paces out from the measurements. */
export const createFitnessTest = (
  body: CreateFitnessTestBody
): Promise<FitnessTestResponse> =>
  apiFetch<FitnessTestResponse>({
    endpoint: '/api/v2/fitness-tests',
    serviceName: SERVICE,
    operation: 'save fitness test',
    method: 'POST',
    body,
  });

export const deleteFitnessTest = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/fitness-tests/${id}`,
    serviceName: SERVICE,
    operation: 'delete fitness test',
    method: 'DELETE',
  });
