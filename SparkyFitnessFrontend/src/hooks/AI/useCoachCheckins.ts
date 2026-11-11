import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateCoachCheckinSettingsBody } from '@workspace/shared';
import {
  dismissCoachMessage,
  loadCoachCheckinSettings,
  loadCoachMessages,
  runCoachCheckNow,
  saveCoachCheckinSettings,
} from '@/api/Chatbot/coachCheckinService';
import { useAuth } from '@/hooks/useAuth';

const MESSAGES_STALE_MS = 5 * 60 * 1000;

/** The messages the person's coaches left (#2013). */
export function useCoachMessages(enabled = true) {
  const { user } = useAuth();
  const client = useQueryClient();
  const queryKey = ['coachCheckins', user?.id, 'messages'];

  const messages = useQuery({
    queryKey,
    queryFn: loadCoachMessages,
    enabled: enabled && !!user,
    staleTime: MESSAGES_STALE_MS,
    retry: false,
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => dismissCoachMessage(id),
    onSettled: () => client.invalidateQueries({ queryKey }),
  });

  return { messages, dismiss };
}

/** The check-in settings, and the "check now" action. */
export function useCoachCheckinSettings() {
  const { user } = useAuth();
  const client = useQueryClient();
  const root = ['coachCheckins', user?.id];
  const queryKey = [...root, 'settings'];

  const settings = useQuery({
    queryKey,
    queryFn: loadCoachCheckinSettings,
    enabled: !!user,
  });

  const save = useMutation({
    mutationFn: (body: UpdateCoachCheckinSettingsBody) =>
      saveCoachCheckinSettings(body),
    onSuccess: (data) => client.setQueryData(queryKey, data),
  });

  const checkNow = useMutation({
    mutationFn: runCoachCheckNow,
    onSuccess: () => client.invalidateQueries({ queryKey: root }),
  });

  return { settings, save, checkNow };
}
