import { apiFetch } from '../../../src/services/api/apiClient';
import { ApiError } from '../../../src/services/api/errors';
import {
  fetchAdaptiveTdeeKcal,
  fetchOnboardingStartWeight,
} from '../../../src/services/api/weightProgressApi';

jest.mock('../../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));
const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('weightProgressApi', () => {
  beforeEach(() => mockApiFetch.mockReset());

  it('reads the onboarding start weight', async () => {
    mockApiFetch.mockResolvedValue({ weightKg: 92.5, date: '2026-01-15' });
    await expect(fetchOnboardingStartWeight()).resolves.toEqual({
      weightKg: 92.5,
      date: '2026-01-15',
    });
    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: '/api/onboarding/start-weight' })
    );
  });

  it('reads an older server without the route as no onboarding weight', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Not found', 404));
    await expect(fetchOnboardingStartWeight()).resolves.toEqual({
      weightKg: null,
      date: null,
    });
    mockApiFetch.mockRejectedValue(new ApiError('Boom', 500));
    await expect(fetchOnboardingStartWeight()).rejects.toThrow('Boom');
  });

  it('returns the adaptive TDEE figure, or null for an unexpected body', async () => {
    mockApiFetch.mockResolvedValue({
      tdee: 2350,
      confidence: 'MEDIUM',
      isFallback: false,
      daysOfData: 20,
      lastCalculated: '2026-11-15',
    });
    await expect(fetchAdaptiveTdeeKcal('2026-11-15')).resolves.toBe(2350);
    mockApiFetch.mockResolvedValue({});
    await expect(fetchAdaptiveTdeeKcal('2026-11-15')).resolves.toBeNull();
  });
});
