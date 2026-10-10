import type {
  CompleteRunProgramWorkoutBody,
  GetRunProgramResponse,
  UpsertRunProgramBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Run Program API';

/** The person's run program and place in it, or `{ program: null }`. */
export const fetchRunProgram = (): Promise<GetRunProgramResponse> =>
  apiFetch<GetRunProgramResponse>({
    endpoint: '/api/v2/run-program',
    serviceName: SERVICE,
    operation: 'fetch run program',
  });

/** Starts the program, switches it on or off, or moves within it. */
export const saveRunProgram = (
  body: UpsertRunProgramBody
): Promise<GetRunProgramResponse> =>
  apiFetch<GetRunProgramResponse>({
    endpoint: '/api/v2/run-program',
    serviceName: SERVICE,
    operation: 'save run program',
    method: 'PUT',
    body,
  });

/** Marks workout `index` done; the server only moves on if it was due. */
export const markRunProgramWorkoutDone = (
  body: CompleteRunProgramWorkoutBody
): Promise<GetRunProgramResponse> =>
  apiFetch<GetRunProgramResponse>({
    endpoint: '/api/v2/run-program/complete',
    serviceName: SERVICE,
    operation: 'complete run program workout',
    method: 'POST',
    body,
  });
