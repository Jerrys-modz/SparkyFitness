import { z } from 'zod';
import {
  aiServiceSettingsPostResponseSchema,
  aiServiceSettingsResponseSchema,
  testAiServiceConnectionResponseSchema,
  type AiServiceSettingsPostResponse,
  type AiServiceSettingsResponse,
  type CreateAiServiceSettingsRequest,
  type TestAiServiceConnectionRequest,
  type TestAiServiceConnectionResponse,
  type UpdateAiServiceSettingsRequest,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { ApiError } from './errors';
import type { ServerConfig } from '../storage';

const SERVICE = 'AI Services API';

/**
 * The AI services the person can see: their own, plus the global ones an
 * administrator shares (`is_public`). With per-user configuration turned off
 * the server sends only the global ones. A 404 means none.
 */
export async function fetchAiServices(
  serverConfig?: ServerConfig
): Promise<AiServiceSettingsResponse[]> {
  try {
    const response = await apiFetch<unknown>({
      endpoint: '/api/chat/ai-service-settings',
      serviceName: SERVICE,
      operation: 'fetch AI services',
      serverConfig,
    });
    return response
      ? z.array(aiServiceSettingsResponseSchema).parse(response)
      : [];
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 404) return [];
    throw error;
  }
}

/**
 * Adds one of the person's own AI services, or updates it when `id` is given.
 * A blank `api_key` on an update keeps the stored key.
 */
export async function saveAiService(
  data:
    | CreateAiServiceSettingsRequest
    | (UpdateAiServiceSettingsRequest & { id: string }),
  serverConfig?: ServerConfig
): Promise<AiServiceSettingsPostResponse> {
  const response = await apiFetch<unknown>({
    endpoint: '/api/chat',
    serviceName: SERVICE,
    operation: 'save AI service',
    method: 'POST',
    body: { action: 'save_ai_service_settings', service_data: data },
    // The request carries the API key; keep a failed response out of the log.
    logResponseBody: false,
    serverConfig,
  });
  return aiServiceSettingsPostResponseSchema.parse(response);
}

export async function deleteAiService(
  serviceId: string,
  serverConfig?: ServerConfig
): Promise<void> {
  await apiFetch<unknown>({
    endpoint: `/api/chat/ai-service-settings/${encodeURIComponent(serviceId)}`,
    serviceName: SERVICE,
    operation: 'delete AI service',
    method: 'DELETE',
    serverConfig,
  });
}

/**
 * Tries a provider with a tiny request. The server answers 200 for both a pass
 * and a provider failure (`ok: false` with a `category`). On an edit the key
 * can be left blank and `id` given: the server then uses the stored key.
 */
export async function testAiServiceConnection(
  payload: TestAiServiceConnectionRequest,
  serverConfig?: ServerConfig
): Promise<TestAiServiceConnectionResponse> {
  const response = await apiFetch<unknown>({
    endpoint: '/api/chat/ai-service-settings/test',
    serviceName: SERVICE,
    operation: 'test AI service',
    method: 'POST',
    body: payload,
    logResponseBody: false,
    serverConfig,
  });
  return testAiServiceConnectionResponseSchema.parse(response);
}
