import { useQuery } from '@tanstack/react-query';
import type {
  CreateSegmentBody,
  EntrySegmentEffort,
  SegmentEffortsResponse,
  SegmentSummary,
} from '@workspace/shared';
import { queryClient } from '../hooks/queryClient';
import {
  entrySegmentEffortsQueryKey,
  segmentQueryKey,
  segmentsQueryKey,
} from '../hooks/queryKeys';
import {
  createSegment,
  deleteSegment,
  fetchEntrySegmentEfforts,
  fetchSegmentEfforts,
  fetchSegments,
  matchSegment,
  updateSegment,
} from './api/segmentApi';
import { addLog } from './LogService';

/** The person's segments, most recently changed first. */
export function useSegments(): {
  segments: SegmentSummary[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
} {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: segmentsQueryKey,
    queryFn: async () => (await fetchSegments()).segments,
    staleTime: 0,
  });
  return { segments: data ?? [], isLoading, isError, refetch };
}

/** One segment with the person's efforts on it. */
export function useSegmentEfforts(id: string): {
  data: SegmentEffortsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => Promise<unknown>;
} {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: segmentQueryKey(id),
    queryFn: () => fetchSegmentEfforts(id),
    enabled: id.length > 0,
  });
  return { data, isLoading, isError, refetch };
}

/**
 * The segments one activity ran. Best effort: a failure reads as none, since
 * the run is already saved and the summary should not turn into an error.
 */
export function useEntrySegmentEfforts(entryId: string | undefined): {
  efforts: EntrySegmentEffort[];
  isLoading: boolean;
} {
  const { data, isLoading } = useQuery({
    queryKey: entrySegmentEffortsQueryKey(entryId ?? ''),
    queryFn: async () =>
      (await fetchEntrySegmentEfforts(entryId ?? '')).efforts,
    enabled: !!entryId,
    retry: false,
    // A new best is only a new best once; ask again when the screen is reopened.
    staleTime: 0,
  });
  return { efforts: data ?? [], isLoading };
}

const refreshSegments = () =>
  queryClient.invalidateQueries({ queryKey: segmentsQueryKey });

/** The most batches one call walks through; each reads up to 100 activities. */
export const MATCH_MAX_ROUNDS = 40;

/**
 * Finds the person's past passes over a segment, batch by batch, until the
 * server says nothing is left. Returns how many passes were found. A failure
 * part-way keeps what was found and is not thrown: the next run continues
 * where it stopped, because the server caches every result.
 */
export async function findSegmentEfforts(id: string): Promise<number> {
  let found = 0;
  try {
    for (let round = 0; round < MATCH_MAX_ROUNDS; round++) {
      const result = await matchSegment(id);
      found += result.found;
      if (!result.hasMore) break;
    }
  } catch (error) {
    addLog(`[Segments] Matching stopped early: ${error}`, 'WARNING');
  } finally {
    await queryClient.invalidateQueries({ queryKey: segmentQueryKey(id) });
    await refreshSegments();
  }
  return found;
}

/** Saves a segment and starts finding the past efforts over it (not awaited). */
export async function saveSegment(
  body: CreateSegmentBody
): Promise<SegmentSummary> {
  const { segment } = await createSegment(body);
  await refreshSegments();
  void findSegmentEfforts(segment.id);
  return segment;
}

export async function renameSegment(
  id: string,
  name: string | null
): Promise<SegmentSummary> {
  const { segment } = await updateSegment(id, { name });
  await queryClient.invalidateQueries({ queryKey: segmentQueryKey(id) });
  await refreshSegments();
  return segment;
}

export async function removeSegment(id: string): Promise<void> {
  await deleteSegment(id);
  queryClient.removeQueries({ queryKey: segmentQueryKey(id) });
  await refreshSegments();
  // Run summaries list the segment too.
  await queryClient.invalidateQueries({ queryKey: ['segments', 'entry'] });
}
