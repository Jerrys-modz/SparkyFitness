import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FoodAssistantPreference } from '@workspace/shared';
import {
  forgetFoodAssistantPreference,
  loadFoodAssistantPreferences,
  saveFoodAssistantPreference,
} from '@/api/Chatbot/foodAssistantService';
import { useAuth } from '@/hooks/useAuth';

type SavedPreferenceAction =
  | { action: 'save'; key: string; value: string; expectedVersion: number }
  | { action: 'forget'; preference: FoodAssistantPreference };

/**
 * What the person asked Sparky to remember. Shares its cache with the chat's
 * preferences panel (`useFoodAssistantState`), so an edit in one shows in the
 * other.
 */
export function useSavedPreferences() {
  const { user } = useAuth();
  const client = useQueryClient();
  const key = ['foodAssistant', user?.id];

  const preferences = useQuery({
    queryKey: [...key, 'preferences'],
    queryFn: loadFoodAssistantPreferences,
    enabled: !!user,
  });

  const mutation = useMutation({
    mutationFn: async (input: SavedPreferenceAction) => {
      if (input.action === 'save') {
        await saveFoodAssistantPreference(
          input.key,
          input.value,
          input.expectedVersion
        );
      } else {
        await forgetFoodAssistantPreference(input.preference);
      }
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });

  return { preferences, mutation };
}
