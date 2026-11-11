import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  loadUserPreferences,
  loadChatHistory,
  clearChatHistory,
} from '@/api/Chatbot/sparkyChatService';
import { getSelectedCoachId } from '@/utils/chatCoachSelection';
import { chatbotKeys } from '@/api/keys/ai';

export const useChatPreferencesQuery = () => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: chatbotKeys.preferences(),
    queryFn: () => loadUserPreferences(),
    meta: {
      errorMessage: t(
        'chat.errorLoadingPreferences',
        'Failed to load chat preferences.'
      ),
    },
  });
};

export const useChatHistoryQuery = (
  autoClearSetting: string,
  enabled: boolean,
  // The coach whose thread to load; null is plain Sparky's.
  coachId: string | null = null
) => {
  const { t } = useTranslation();

  return useQuery({
    queryKey: chatbotKeys.history(autoClearSetting, coachId),
    queryFn: () => loadChatHistory(autoClearSetting, coachId),
    enabled,
    // Dropped as soon as nothing shows it, so coming back to a coach loads
    // its thread from the server instead of seeding the chat from a copy
    // taken before the last messages were sent.
    gcTime: 0,
    meta: {
      errorMessage: t(
        'chat.errorLoadingHistory',
        'Failed to load chat history.'
      ),
    },
  });
};

export const useClearChatHistoryMutation = () => {
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  return useMutation({
    mutationFn: (clearType: 'manual' | 'all') =>
      clearChatHistory(clearType, getSelectedCoachId()),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: [...chatbotKeys.all, 'history'] });
    },
    meta: {
      successMessage: t(
        'chat.successClearingHistory',
        'Chat history cleared successfully.'
      ),
      errorMessage: t(
        'chat.errorClearingHistory',
        'Failed to clear chat history.'
      ),
    },
  });
};
