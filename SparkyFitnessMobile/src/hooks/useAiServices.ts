import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateAiServiceSettingsRequest,
  TestAiServiceConnectionRequest,
  UpdateAiServiceSettingsRequest,
} from '@workspace/shared';
import {
  deleteAiService,
  fetchAiServices,
  saveAiService,
  testAiServiceConnection,
} from '../services/api/aiServicesApi';
import { updatePreferences } from '../services/api/preferencesApi';
import type { ServerConfig } from '../services/storage';
import type { UserPreferences } from '../types/preferences';
import {
  aiServicesQueryKey,
  aiServiceSettingsRootQueryKey,
  preferencesQueryKey,
} from './queryKeys';
import { serverOnScreen } from './serverOnScreen';

export function useAiServices({ enabled = true } = {}) {
  return useQuery({
    queryKey: aiServicesQueryKey,
    queryFn: () => fetchAiServices(),
    enabled,
  });
}

/**
 * Every AI read (the list, the active service, voice options, the per-user
 * switch) and the preferences that point at a service go stale together.
 */
function useInvalidateAiServices() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: aiServiceSettingsRootQueryKey });
    queryClient.invalidateQueries({ queryKey: preferencesQueryKey });
  };
}

/** The account a change belongs to: the one on screen when it was made. */
function useAccount(): () => ServerConfig {
  const queryClient = useQueryClient();
  return () => {
    const config = serverOnScreen(queryClient);
    if (!config) throw new Error('No server on screen');
    return config;
  };
}

export type SaveAiServiceInput =
  | CreateAiServiceSettingsRequest
  | (UpdateAiServiceSettingsRequest & { id: string });

export function useSaveAiService() {
  const invalidate = useInvalidateAiServices();
  const account = useAccount();
  return useMutation({
    mutationFn: (data: SaveAiServiceInput) => saveAiService(data, account()),
    onSettled: invalidate,
  });
}

export function useDeleteAiService() {
  const invalidate = useInvalidateAiServices();
  const account = useAccount();
  return useMutation({
    mutationFn: (serviceId: string) => deleteAiService(serviceId, account()),
    onSettled: invalidate,
  });
}

/** Picks the AI service in use, or the one for photos and labels. */
export function useSetActiveAiService() {
  const invalidate = useInvalidateAiServices();
  const account = useAccount();
  return useMutation({
    mutationFn: (
      patch: Pick<
        UserPreferences,
        'active_ai_service_id' | 'active_vision_ai_service_id'
      >
    ) => updatePreferences(patch, account()),
    onSettled: invalidate,
  });
}

/** A test changes nothing, so nothing is invalidated. */
export function useTestAiService() {
  const account = useAccount();
  return useMutation({
    mutationFn: (payload: TestAiServiceConnectionRequest) =>
      testAiServiceConnection(payload, account()),
  });
}
