import {
  deleteAiService,
  fetchAiServices,
  saveAiService,
  testAiServiceConnection,
} from '../../../src/services/api/aiServicesApi';
import { apiFetch } from '../../../src/services/api/apiClient';
import { ApiError } from '../../../src/services/api/errors';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

const row = {
  id: '11111111-1111-4111-8111-111111111111',
  service_name: 'Mine',
  service_type: 'openai',
  custom_url: null,
  model_name: 'gpt-4o',
  is_active: true,
  is_public: false,
  system_prompt: null,
  user_id: '22222222-2222-4222-8222-222222222222',
  chat_tool_profile: 'full',
  reasoning_effort: 'medium',
  supports_audio_input: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

describe('aiServicesApi', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lists services and reads a 404 as none', async () => {
    mockApiFetch.mockResolvedValueOnce([row]);
    await expect(fetchAiServices()).resolves.toHaveLength(1);
    mockApiFetch.mockRejectedValueOnce(new ApiError('nope', 404));
    await expect(fetchAiServices()).resolves.toEqual([]);
    mockApiFetch.mockRejectedValueOnce(new ApiError('down', 500));
    await expect(fetchAiServices()).rejects.toThrow('down');
  });

  it('saves through the chat action and keeps the key out of the log', async () => {
    mockApiFetch.mockResolvedValueOnce({ message: 'ok', setting: row });
    await saveAiService({
      service_name: 'Mine',
      service_type: 'openai',
      api_key: 'sk-secret',
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/chat',
        method: 'POST',
        logResponseBody: false,
        body: {
          action: 'save_ai_service_settings',
          service_data: {
            service_name: 'Mine',
            service_type: 'openai',
            api_key: 'sk-secret',
          },
        },
      })
    );
  });

  it('deletes and tests by id', async () => {
    mockApiFetch.mockResolvedValueOnce(undefined);
    await deleteAiService('a/b');
    expect(mockApiFetch).toHaveBeenLastCalledWith(
      expect.objectContaining({
        endpoint: '/api/chat/ai-service-settings/a%2Fb',
        method: 'DELETE',
      })
    );

    mockApiFetch.mockResolvedValueOnce({ ok: false, category: 'timeout' });
    await expect(
      testAiServiceConnection({ service_type: 'ollama', id: 'x' })
    ).resolves.toEqual({ ok: false, category: 'timeout' });
  });
});
