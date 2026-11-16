import {
  adaptiveTdeeResponseSchema,
  onboardingStartWeightResponseSchema,
  type OnboardingStartWeightResponse,
} from '@workspace/shared';
import { apiFetch } from './apiClient';
import { ApiError } from './errors';

/**
 * The weight given in the setup wizard and its day. An older server without
 * the route answers 404, read as no onboarding weight.
 */
export const fetchOnboardingStartWeight =
  async (): Promise<OnboardingStartWeightResponse> => {
    try {
      const response = await apiFetch<unknown>({
        endpoint: '/api/onboarding/start-weight',
        serviceName: 'Onboarding API',
        operation: 'fetch onboarding start weight',
      });
      return onboardingStartWeightResponseSchema.parse(response);
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 404) {
        return { weightKg: null, date: null };
      }
      throw error;
    }
  };

/** Today's estimated daily expenditure (Adaptive TDEE, or its fallback), kcal. */
export const fetchAdaptiveTdeeKcal = async (
  date: string
): Promise<number | null> => {
  const response = await apiFetch<unknown>({
    endpoint: `/api/adaptive-tdee?date=${encodeURIComponent(date)}`,
    serviceName: 'Adaptive TDEE API',
    operation: 'fetch adaptive TDEE',
  });
  const parsed = adaptiveTdeeResponseSchema.safeParse(response);
  return parsed.success ? parsed.data.tdee : null;
};
