export interface ServiceType {
  value: string;
  label: string;
}

export const getServiceTypes = (t: (key: string) => string): ServiceType[] => [
  { value: 'openai', label: t('settings.aiService.serviceTypes.openai') },
  {
    value: 'openai_compatible',
    label: t('settings.aiService.serviceTypes.openaiCompatible'),
  },
  {
    value: 'anthropic',
    label: t('settings.aiService.serviceTypes.anthropic'),
  },
  { value: 'google', label: t('settings.aiService.serviceTypes.google') },
  { value: 'mistral', label: t('settings.aiService.serviceTypes.mistral') },
  { value: 'groq', label: t('settings.aiService.serviceTypes.groq') },
  { value: 'ollama', label: t('settings.aiService.serviceTypes.ollama') },
  {
    value: 'openrouter',
    label: t('settings.aiService.serviceTypes.openrouter'),
  },
  { value: 'xai', label: t('settings.aiService.serviceTypes.xai') },
  {
    value: 'perplexity',
    label: t('settings.aiService.serviceTypes.perplexity'),
  },
  { value: 'meta', label: t('settings.aiService.serviceTypes.meta') },
  {
    value: 'opencode_go',
    label: t('settings.aiService.serviceTypes.opencodeGo'),
  },
  { value: 'custom', label: t('settings.aiService.serviceTypes.custom') },
];

export {
  getModelOptions,
  isCustomModelName,
  providerDetailText,
  requiresApiKey,
  supportsVoiceTranscriptionServiceType,
} from '@workspace/shared';
