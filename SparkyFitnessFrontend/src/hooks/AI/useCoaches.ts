import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateCoachBody } from '@workspace/shared';
import {
  createCoach,
  deleteCoach,
  loadCoaches,
  updateCoach,
} from '@/api/Chatbot/coachService';
import { useAuth } from '@/hooks/useAuth';

type CoachAction =
  | { action: 'create'; body: CreateCoachBody }
  | { action: 'update'; id: string; body: CreateCoachBody }
  | { action: 'delete'; id: string };

/** The person's own coaches (#2013) and the edits to them. */
export function useCoaches() {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ['coaches', user?.id];

  const coaches = useQuery({
    queryKey,
    queryFn: loadCoaches,
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async (input: CoachAction) => {
      if (input.action === 'create') await createCoach(input.body);
      else if (input.action === 'update')
        await updateCoach(input.id, input.body);
      else await deleteCoach(input.id);
    },
    onSettled: () => client.invalidateQueries({ queryKey }),
  });

  return { coaches, mutation };
}
