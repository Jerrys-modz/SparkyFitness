import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContraction,
  getContractions,
  startKickSession,
  updateContraction,
  updateKickSession,
  type UpdateKickSessionBody,
} from '../services/api/pregnancyApi';
import {
  pregnancyContractionsQueryKey,
  pregnancyOverviewQueryKey,
} from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/** Kick session start/update. Updates refresh the overview's recent sessions. */
export function useKickSessionMutations() {
  const queryClient = useQueryClient();

  const startMutation = useMutation({
    mutationFn: (pregnancyId: string) => startKickSession(pregnancyId),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: UpdateKickSessionBody }) =>
      updateKickSession(id, body),
    onSuccess: (_session, { body }) => {
      if (body.ended) {
        queryClient.invalidateQueries({ queryKey: pregnancyOverviewQueryKey });
      }
    },
  });

  return {
    startKickSessionAsync: startMutation.mutateAsync,
    isStarting: startMutation.isPending,
    updateKickSessionAsync: updateMutation.mutateAsync,
  };
}

/** Recent contractions plus the server's 5-1-1 analysis. */
export function useContractions() {
  const query = useQuery({
    queryKey: pregnancyContractionsQueryKey,
    queryFn: getContractions,
  });

  useRefetchOnFocus(query.refetch);

  return {
    contractions: query.data?.contractions ?? [],
    stats: query.data?.stats ?? null,
    isLoading: query.isLoading,
    refetch: query.refetch,
  };
}

export function useContractionMutations() {
  const queryClient = useQueryClient();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: pregnancyContractionsQueryKey });
  };

  const createMutation = useMutation({
    mutationFn: ({
      pregnancyId,
      startedAt,
    }: {
      pregnancyId: string;
      startedAt: string;
    }) => createContraction(pregnancyId, startedAt),
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: string;
      body: { ended_at?: string | null; intensity?: number | null };
    }) => updateContraction(id, body),
    onSuccess: invalidate,
  });

  return {
    createContractionAsync: createMutation.mutateAsync,
    updateContractionAsync: updateMutation.mutateAsync,
  };
}
