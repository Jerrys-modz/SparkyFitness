import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ReasoningEffort } from './aiServiceForm';

/** The name of an AI service type as the app shows it; unknown types show their id. */
export function useAiServiceTypeLabel(): (serviceType: string) => string {
  const { t } = useTranslation();
  return useCallback(
    (serviceType: string): string => {
      switch (serviceType) {
        case 'openai':
          return t('aiServices.types.openai', { defaultValue: 'OpenAI' });
        case 'openai_compatible':
          return t('aiServices.types.openaiCompatible', {
            defaultValue: 'OpenAI compatible',
          });
        case 'anthropic':
          return t('aiServices.types.anthropic', {
            defaultValue: 'Anthropic',
          });
        case 'google':
          return t('aiServices.types.google', {
            defaultValue: 'Google Gemini',
          });
        case 'mistral':
          return t('aiServices.types.mistral', { defaultValue: 'Mistral AI' });
        case 'groq':
          return t('aiServices.types.groq', { defaultValue: 'Groq' });
        case 'ollama':
          return t('aiServices.types.ollama', { defaultValue: 'Ollama' });
        case 'openrouter':
          return t('aiServices.types.openrouter', {
            defaultValue: 'OpenRouter',
          });
        case 'xai':
          return t('aiServices.types.xai', { defaultValue: 'xAI (Grok)' });
        case 'perplexity':
          return t('aiServices.types.perplexity', {
            defaultValue: 'Perplexity AI',
          });
        case 'meta':
          return t('aiServices.types.meta', { defaultValue: 'Meta' });
        case 'opencode_go':
          return t('aiServices.types.opencodeGo', {
            defaultValue: 'OpenCode Go',
          });
        case 'custom':
          return t('aiServices.types.custom', { defaultValue: 'Custom' });
        default:
          return serviceType;
      }
    },
    [t]
  );
}

export function useReasoningEffortLabel(): (effort: ReasoningEffort) => string {
  const { t } = useTranslation();
  return useCallback(
    (effort: ReasoningEffort): string => {
      switch (effort) {
        case 'low':
          return t('aiServices.effort.low', { defaultValue: 'Low' });
        case 'medium':
          return t('aiServices.effort.medium', {
            defaultValue: 'Medium (recommended)',
          });
        case 'high':
          return t('aiServices.effort.high', { defaultValue: 'High' });
        case 'xhigh':
          return t('aiServices.effort.xhigh', { defaultValue: 'Extra high' });
        case 'max':
          return t('aiServices.effort.max', { defaultValue: 'Maximum' });
      }
    },
    [t]
  );
}
