import { apiCall } from '@/api/api';
import type {
  FeatureChoicesResponse,
  UpdateFeatureChoicesBody,
} from '@workspace/shared';

/** The person's explicit optional-feature choices (#3487). */
export const getFeatureChoices = async (): Promise<FeatureChoicesResponse> =>
  apiCall('/user-preferences/features', {
    method: 'GET',
    // A delegate whose grant does not cover settings gets a 403; the feature
    // then stays hidden without a toast on every page.
    suppressErrorToast: true,
  });

/** Saves optional-feature choices for the platforms named in the body. */
export const updateFeatureChoices = async (
  body: UpdateFeatureChoicesBody
): Promise<FeatureChoicesResponse> =>
  apiCall('/user-preferences/features', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
