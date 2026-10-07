import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createAppointment,
  deleteAppointment,
  listAppointments,
  type CreateAppointmentBody,
} from '../services/api/pregnancyApi';
import { appointmentsQueryKey, pregnancyOverviewQueryKey } from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

export function useAppointments() {
  const query = useQuery({
    queryKey: appointmentsQueryKey,
    queryFn: listAppointments,
  });

  useRefetchOnFocus(query.refetch);

  return {
    appointments: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}

export function useAppointmentMutations() {
  const queryClient = useQueryClient();

  // The pregnancy overview carries `nextAppointment`.
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: appointmentsQueryKey });
    queryClient.invalidateQueries({ queryKey: pregnancyOverviewQueryKey });
  };

  const createMutation = useMutation({
    mutationFn: (body: CreateAppointmentBody) => createAppointment(body),
    onSuccess: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    onSuccess: invalidate,
  });

  return {
    createAppointmentAsync: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    deleteAppointmentAsync: deleteMutation.mutateAsync,
  };
}
