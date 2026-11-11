import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateCoachCheckinSettingsBody } from '@workspace/shared';
import {
  dismissCoachMessage,
  fetchCoachCheckinSettings,
  fetchCoachMessages,
  runCoachCheckNow,
  saveCoachCheckinSettings,
} from '../services/api/coachCheckinsApi';
import {
  coachCheckinSettingsQueryKey,
  coachMessagesQueryKey,
} from './queryKeys';
import { useRefetchOnFocus } from './useRefetchOnFocus';

/** The messages the person's coaches left (#2013). */
export function useCoachMessages() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: coachMessagesQueryKey,
    queryFn: fetchCoachMessages,
    retry: false,
  });
  useRefetchOnFocus(query.refetch);

  const dismiss = useMutation({
    mutationFn: (id: string) => dismissCoachMessage(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: coachMessagesQueryKey });
    },
  });

  return { messages: query.data ?? [], dismiss };
}

/** The check-in settings, and the "check now" action. */
export function useCoachCheckinSettings() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: coachCheckinSettingsQueryKey,
    queryFn: fetchCoachCheckinSettings,
  });

  const save = useMutation({
    mutationFn: (body: UpdateCoachCheckinSettingsBody) =>
      saveCoachCheckinSettings(body),
    onSuccess: (data) => {
      queryClient.setQueryData(coachCheckinSettingsQueryKey, data);
    },
  });

  const checkNow = useMutation({
    mutationFn: runCoachCheckNow,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: coachMessagesQueryKey });
    },
  });

  return { settings: query.data, isError: query.isError, save, checkNow };
}
