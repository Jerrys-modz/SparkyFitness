import {
  getModelOptions,
  isCustomModelName,
  isGpt6Model,
  requiresApiKey,
  requiresCustomUrl,
  supportsVoiceTranscriptionServiceType,
  type AiServiceSettingsResponse,
  type CreateAiServiceSettingsRequest,
  type TestAiServiceConnectionRequest,
  type UpdateAiServiceSettingsRequest,
} from '@workspace/shared';

export type ReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';
export const REASONING_EFFORTS: readonly ReasoningEffort[] = [
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
];
export type ChatToolProfile = 'full' | 'core';

/** What the add/edit form holds. `apiKey` is blank on edit: the stored key is never sent back. */
export interface AiServiceDraft {
  name: string;
  serviceType: string;
  apiKey: string;
  customUrl: string;
  /** The picked suggestion, or what was typed when `customModel` is on. */
  modelName: string;
  /** Type a model name instead of picking a suggestion. */
  customModel: boolean;
  reasoningEffort: ReasoningEffort;
  chatToolProfile: ChatToolProfile;
  supportsAudioInput: boolean;
  systemPrompt: string;
  enabled: boolean;
}

export const NEW_AI_SERVICE_DRAFT: AiServiceDraft = {
  name: '',
  serviceType: 'openai',
  apiKey: '',
  customUrl: '',
  modelName: '',
  customModel: false,
  reasoningEffort: 'medium',
  chatToolProfile: 'full',
  supportsAudioInput: false,
  systemPrompt: '',
  enabled: true,
};

export function draftFromService(
  service: AiServiceSettingsResponse
): AiServiceDraft {
  const modelName = service.model_name ?? '';
  return {
    name: service.service_name,
    serviceType: service.service_type,
    apiKey: '',
    customUrl: service.custom_url ?? '',
    modelName,
    customModel:
      getModelOptions(service.service_type).length > 0 &&
      isCustomModelName(service.service_type, modelName),
    reasoningEffort: service.reasoning_effort ?? 'medium',
    chatToolProfile: service.chat_tool_profile ?? 'full',
    supportsAudioInput: service.supports_audio_input ?? false,
    systemPrompt: service.system_prompt ?? '',
    enabled: service.is_active,
  };
}

/** Which optional fields the form shows for the draft's service type and model. */
export function aiServiceFormFields(draft: AiServiceDraft) {
  const suggestions = getModelOptions(draft.serviceType);
  return {
    needsApiKey: requiresApiKey(draft.serviceType),
    needsCustomUrl: requiresCustomUrl(draft.serviceType),
    modelSuggestions: suggestions,
    // Types without suggestions (self-hosted servers, OpenCode Go) are typed.
    typesModel: suggestions.length === 0 || draft.customModel,
    showsReasoningEffort:
      draft.serviceType === 'openai' && isGpt6Model(draft.modelName),
    showsToolProfile: requiresCustomUrl(draft.serviceType),
    isOllama: draft.serviceType === 'ollama',
    supportsVoice: supportsVoiceTranscriptionServiceType(draft.serviceType),
  };
}

export type AiServiceDraftProblem =
  'name' | 'apiKey' | 'customUrl' | 'model' | null;

/**
 * The first thing missing before the draft can be saved. A new cloud service
 * needs a key; an edit can leave it blank to keep the stored one. Types
 * without suggested models have no server-side default, so they need one.
 */
export function aiServiceDraftProblem(
  draft: AiServiceDraft,
  isEdit: boolean
): AiServiceDraftProblem {
  const fields = aiServiceFormFields(draft);
  if (!draft.name.trim()) return 'name';
  if (fields.needsApiKey && !isEdit && !draft.apiKey.trim()) return 'apiKey';
  if (fields.needsCustomUrl && !draft.customUrl.trim()) return 'customUrl';
  if (fields.modelSuggestions.length === 0 && !draft.modelName.trim()) {
    return 'model';
  }
  return null;
}

const trimmedOrUndefined = (value: string) => value.trim() || undefined;

/** The body for adding the service, or updating it when `id` is given. */
export function aiServiceSaveRequest(
  draft: AiServiceDraft,
  id?: string
):
  | CreateAiServiceSettingsRequest
  | (UpdateAiServiceSettingsRequest & { id: string }) {
  const fields = aiServiceFormFields(draft);
  const body = {
    service_name: draft.name.trim(),
    service_type: draft.serviceType,
    // Blank on an edit keeps the stored key.
    api_key: trimmedOrUndefined(draft.apiKey),
    custom_url: fields.needsCustomUrl ? draft.customUrl.trim() : null,
    model_name: trimmedOrUndefined(draft.modelName) ?? null,
    reasoning_effort: fields.showsReasoningEffort
      ? draft.reasoningEffort
      : undefined,
    chat_tool_profile: fields.showsToolProfile ? draft.chatToolProfile : 'full',
    supports_audio_input: fields.supportsVoice && draft.supportsAudioInput,
    system_prompt: draft.systemPrompt.trim(),
    is_active: draft.enabled,
  };
  return id ? { ...body, id } : body;
}

/** The connection test for the draft; on an edit a blank key tests the stored one. */
export function aiServiceTestRequest(
  draft: AiServiceDraft,
  id?: string
): TestAiServiceConnectionRequest {
  const fields = aiServiceFormFields(draft);
  return {
    ...(id ? { id } : {}),
    service_type: draft.serviceType,
    api_key: trimmedOrUndefined(draft.apiKey),
    custom_url: fields.needsCustomUrl
      ? trimmedOrUndefined(draft.customUrl)
      : undefined,
    model_name: trimmedOrUndefined(draft.modelName),
  };
}

/** The services the active-service pickers offer: only enabled ones can power AI. */
export function enabledAiServices(
  services: readonly AiServiceSettingsResponse[]
): AiServiceSettingsResponse[] {
  return services.filter((service) => service.is_active);
}

/**
 * The service in use: the saved choice when it is still enabled, else the one
 * the server reports as active (which falls back to the global service).
 */
export function resolveActiveAiServiceId(
  services: readonly AiServiceSettingsResponse[],
  savedId: string | null | undefined,
  serverActiveId: string | null | undefined
): string | null {
  const enabled = enabledAiServices(services);
  return (
    enabled.find((s) => s.id === savedId)?.id ??
    enabled.find((s) => s.id === serverActiveId)?.id ??
    null
  );
}
