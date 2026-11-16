import type { FeatureChoicesResponse } from '@workspace/shared';
import { apiFetch } from './apiClient';

/** The person's explicit optional-feature choices, per platform (#3487). */
export const fetchFeatureChoices = (): Promise<FeatureChoicesResponse> =>
  apiFetch<FeatureChoicesResponse>({
    endpoint: '/api/user-preferences/features',
    serviceName: 'Feature Choices API',
    operation: 'fetch feature choices',
  });
