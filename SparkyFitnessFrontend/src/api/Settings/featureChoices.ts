import { apiCall } from '@/api/api';
import type { FeatureChoicesResponse } from '@workspace/shared';

/** The person's explicit optional-feature choices (#3487). */
export const getFeatureChoices = async (): Promise<FeatureChoicesResponse> =>
  apiCall('/user-preferences/features', {
    method: 'GET',
    // A delegate whose grant does not cover settings gets a 403; the feature
    // then stays hidden without a toast on every page.
    suppressErrorToast: true,
  });
