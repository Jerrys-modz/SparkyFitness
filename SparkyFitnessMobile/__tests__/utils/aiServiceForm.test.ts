import type { AiServiceSettingsResponse } from '@workspace/shared';
import {
  NEW_AI_SERVICE_DRAFT,
  aiServiceDraftProblem,
  aiServiceFormFields,
  aiServiceSaveRequest,
  aiServiceTestRequest,
  draftFromService,
  resolveActiveAiServiceId,
} from '../../src/utils/aiServiceForm';

const service = (
  overrides: Partial<AiServiceSettingsResponse> = {}
): AiServiceSettingsResponse =>
  ({
    id: 'svc-1',
    service_name: 'Mine',
    service_type: 'openai',
    custom_url: null,
    model_name: 'gpt-4o',
    is_active: true,
    is_public: false,
    system_prompt: 'Be brief',
    user_id: 'u1',
    chat_tool_profile: 'full',
    reasoning_effort: 'medium',
    supports_audio_input: false,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    ...overrides,
  }) as AiServiceSettingsResponse;

describe('aiServiceFormFields', () => {
  it('asks self-hosted types for a URL and a typed model, not a key', () => {
    const fields = aiServiceFormFields({
      ...NEW_AI_SERVICE_DRAFT,
      serviceType: 'ollama',
    });
    expect(fields.needsApiKey).toBe(false);
    expect(fields.needsCustomUrl).toBe(true);
    expect(fields.typesModel).toBe(true);
    expect(fields.showsToolProfile).toBe(true);
    expect(fields.isOllama).toBe(true);
  });

  it('offers model suggestions for cloud types', () => {
    const fields = aiServiceFormFields(NEW_AI_SERVICE_DRAFT);
    expect(fields.needsApiKey).toBe(true);
    expect(fields.needsCustomUrl).toBe(false);
    expect(fields.modelSuggestions.length).toBeGreaterThan(0);
    expect(fields.typesModel).toBe(false);
  });

  it('shows reasoning effort only for OpenAI GPT-6 models', () => {
    expect(
      aiServiceFormFields({ ...NEW_AI_SERVICE_DRAFT, modelName: 'gpt-6-sol' })
        .showsReasoningEffort
    ).toBe(true);
    expect(
      aiServiceFormFields({ ...NEW_AI_SERVICE_DRAFT, modelName: 'gpt-4o' })
        .showsReasoningEffort
    ).toBe(false);
  });
});

describe('aiServiceDraftProblem', () => {
  it('needs a name, then a key for a new cloud service', () => {
    expect(aiServiceDraftProblem(NEW_AI_SERVICE_DRAFT, false)).toBe('name');
    const named = { ...NEW_AI_SERVICE_DRAFT, name: 'Work' };
    expect(aiServiceDraftProblem(named, false)).toBe('apiKey');
    expect(aiServiceDraftProblem(named, true)).toBeNull();
    expect(aiServiceDraftProblem({ ...named, apiKey: 'sk' }, false)).toBeNull();
  });

  it('needs a URL and a model for a self-hosted server', () => {
    const draft = {
      ...NEW_AI_SERVICE_DRAFT,
      name: 'Home',
      serviceType: 'ollama',
    };
    expect(aiServiceDraftProblem(draft, false)).toBe('customUrl');
    expect(
      aiServiceDraftProblem({ ...draft, customUrl: 'http://box:11434' }, false)
    ).toBe('model');
    expect(
      aiServiceDraftProblem(
        { ...draft, customUrl: 'http://box:11434', modelName: 'llama3' },
        false
      )
    ).toBeNull();
  });
});

describe('save and test requests', () => {
  it('round-trips a saved service without sending the key back', () => {
    const draft = draftFromService(service());
    expect(draft.apiKey).toBe('');
    const body = aiServiceSaveRequest(draft, 'svc-1');
    expect(body).toMatchObject({
      id: 'svc-1',
      service_name: 'Mine',
      service_type: 'openai',
      model_name: 'gpt-4o',
      system_prompt: 'Be brief',
      is_active: true,
      custom_url: null,
    });
    expect(body.api_key).toBeUndefined();
  });

  it('marks a saved unlisted model as typed', () => {
    expect(
      draftFromService(service({ model_name: 'my-finetune' })).customModel
    ).toBe(true);
  });

  it('drops fields the type does not use', () => {
    const body = aiServiceSaveRequest({
      ...NEW_AI_SERVICE_DRAFT,
      name: 'x',
      apiKey: ' sk ',
      customUrl: 'https://ignored',
      chatToolProfile: 'core',
      supportsAudioInput: true,
    });
    expect(body).not.toHaveProperty('id');
    expect(body.api_key).toBe('sk');
    expect(body.custom_url).toBeNull();
    expect(body.chat_tool_profile).toBe('full');
  });

  it('tests an edit with the stored key', () => {
    expect(aiServiceTestRequest(draftFromService(service()), 'svc-1')).toEqual({
      id: 'svc-1',
      service_type: 'openai',
      api_key: undefined,
      custom_url: undefined,
      model_name: 'gpt-4o',
    });
  });
});

describe('resolveActiveAiServiceId', () => {
  const services = [
    service({ id: 'a' }),
    service({ id: 'b', is_active: false }),
    service({ id: 'g', is_public: true }),
  ];

  it('uses the saved choice while it is enabled', () => {
    expect(resolveActiveAiServiceId(services, 'a', 'g')).toBe('a');
  });

  it('falls back to what the server reports when the choice is off', () => {
    expect(resolveActiveAiServiceId(services, 'b', 'g')).toBe('g');
    expect(resolveActiveAiServiceId(services, null, null)).toBeNull();
  });
});
