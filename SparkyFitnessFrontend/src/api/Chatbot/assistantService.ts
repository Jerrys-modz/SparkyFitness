import { apiCall } from '@/api/api';
import { assistantDailySummaryResponseSchema } from '@workspace/shared';

/** Sparky's short summary of today; `refresh` asks for a newly written one. */
export const loadSparkyDailySummary = async (refresh = false) =>
  assistantDailySummaryResponseSchema.parse(
    await apiCall('/v2/assistant/daily-summary', {
      method: 'POST',
      body: refresh ? { refresh: true } : {},
      suppressErrorToast: true,
    })
  );
