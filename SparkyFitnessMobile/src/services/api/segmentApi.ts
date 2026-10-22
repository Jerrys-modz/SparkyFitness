import type {
  CreateSegmentBody,
  EntrySegmentEffortsResponse,
  MatchSegmentResponse,
  SegmentEffortsResponse,
  SegmentSummary,
  UpdateSegmentBody,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Segments API';

/** The person's segments with their own best time and count. */
export const fetchSegments = (): Promise<{ segments: SegmentSummary[] }> =>
  apiFetch<{ segments: SegmentSummary[] }>({
    endpoint: '/api/v2/segments',
    serviceName: SERVICE,
    operation: 'fetch segments',
  });

/** One segment with every effort, newest first. */
export const fetchSegmentEfforts = (
  id: string
): Promise<SegmentEffortsResponse> =>
  apiFetch<SegmentEffortsResponse>({
    endpoint: `/api/v2/segments/${id}`,
    serviceName: SERVICE,
    operation: 'fetch segment',
  });

export const createSegment = (
  body: CreateSegmentBody
): Promise<{ segment: SegmentSummary }> =>
  apiFetch<{ segment: SegmentSummary }>({
    endpoint: '/api/v2/segments',
    serviceName: SERVICE,
    operation: 'create segment',
    method: 'POST',
    body,
  });

export const updateSegment = (
  id: string,
  body: UpdateSegmentBody
): Promise<{ segment: SegmentSummary }> =>
  apiFetch<{ segment: SegmentSummary }>({
    endpoint: `/api/v2/segments/${id}`,
    serviceName: SERVICE,
    operation: 'update segment',
    method: 'PATCH',
    body,
  });

export const deleteSegment = (id: string): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/segments/${id}`,
    serviceName: SERVICE,
    operation: 'delete segment',
    method: 'DELETE',
  });

/** Reads the next batch of past activities for passes over a segment. */
export const matchSegment = (id: string): Promise<MatchSegmentResponse> =>
  apiFetch<MatchSegmentResponse>({
    endpoint: `/api/v2/segments/${id}/match`,
    serviceName: SERVICE,
    operation: 'match segment',
    method: 'POST',
    // A batch reads up to a hundred tracks on the server.
    timeoutMs: 60_000,
  });

/** The segments one activity ran. The server matches any it has not checked yet. */
export const fetchEntrySegmentEfforts = (
  entryId: string
): Promise<EntrySegmentEffortsResponse> =>
  apiFetch<EntrySegmentEffortsResponse>({
    endpoint: `/api/v2/segments/entries/${encodeURIComponent(entryId)}/efforts`,
    serviceName: SERVICE,
    operation: 'fetch activity segments',
  });
