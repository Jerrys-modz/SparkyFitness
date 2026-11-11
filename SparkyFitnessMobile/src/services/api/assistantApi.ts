import type {
  AssistantDailySummaryResponse,
  FoodAssistantPreference,
} from '@workspace/shared';
import { apiFetch } from './apiClient';

const SERVICE = 'Assistant API';

// A local model can take a while to load before it answers.
const DAILY_SUMMARY_TIMEOUT_MS = 120_000;

/** Sparky's short summary of today; `refresh` asks for a newly written one. */
export const fetchSparkyDailySummary = (
  refresh = false
): Promise<AssistantDailySummaryResponse> =>
  apiFetch<AssistantDailySummaryResponse>({
    endpoint: '/api/v2/assistant/daily-summary',
    method: 'POST',
    body: refresh ? { refresh: true } : {},
    timeoutMs: DAILY_SUMMARY_TIMEOUT_MS,
    serviceName: SERVICE,
    operation: 'fetch daily summary',
  });

/** What the person asked Sparky to remember. */
export const fetchSavedPreferences = (): Promise<FoodAssistantPreference[]> =>
  apiFetch<FoodAssistantPreference[]>({
    endpoint: '/api/v2/food-assistant/preferences',
    serviceName: SERVICE,
    operation: 'fetch saved preferences',
  });

/** Creates a preference (`expectedVersion` 0) or changes an existing one. */
export const saveSavedPreference = (
  key: string,
  value: string,
  expectedVersion: number
): Promise<FoodAssistantPreference> =>
  apiFetch<FoodAssistantPreference>({
    endpoint: '/api/v2/food-assistant/preferences',
    method: 'PUT',
    body: { key, value, expected_version: expectedVersion },
    serviceName: SERVICE,
    operation: 'save preference',
  });

export const deleteSavedPreference = (
  preference: Pick<FoodAssistantPreference, 'key' | 'version'>
): Promise<void> =>
  apiFetch<void>({
    endpoint: `/api/v2/food-assistant/preferences/${encodeURIComponent(preference.key)}?version=${preference.version}`,
    method: 'DELETE',
    serviceName: SERVICE,
    operation: 'delete preference',
  });
