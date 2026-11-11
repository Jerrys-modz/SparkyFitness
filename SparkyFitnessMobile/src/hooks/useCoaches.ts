import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCoachBody } from '@workspace/shared';
import {
  createCoach,
  deleteCoach,
  fetchCoaches,
  updateCoach,
} from '../services/api/coachesApi';
import { coachesQueryKey } from './queryKeys';

/** The person's own coaches (#2013) and the edits to them. */
export function useCoaches(options: { enabled?: boolean } = {}) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: coachesQueryKey,
    queryFn: fetchCoaches,
    enabled: options.enabled ?? true,
  });
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: coachesQueryKey });
  };

  const save = useMutation({
    mutationFn: (input: { id: string | null; body: CreateCoachBody }) =>
      input.id ? updateCoach(input.id, input.body) : createCoach(input.body),
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCoach(id),
    onSettled: invalidate,
  });

  return {
    coaches: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    save,
    remove,
  };
}
