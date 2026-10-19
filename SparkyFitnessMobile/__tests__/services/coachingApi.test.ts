import {
  acceptCoachingCheckIn,
  fetchCoachingCheckIn,
  saveCoachingSettings,
} from '../../src/services/api/coachingApi';
import { apiFetch } from '../../src/services/api/apiClient';

jest.mock('../../src/services/api/apiClient', () => ({ apiFetch: jest.fn() }));

beforeEach(() => jest.clearAllMocks());

describe('coachingApi', () => {
  it('reads the check-in from the reports endpoint', async () => {
    await fetchCoachingCheckIn();
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: '/api/reports/coaching-checkin' })
    );
    expect(jest.mocked(apiFetch).mock.calls[0]![0].method).toBeUndefined();
  });

  it('saves settings with PUT', async () => {
    await saveCoachingSettings({ direction: 'lose', rateKgPerWeek: 0.5 });
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/goals/coaching-settings',
        method: 'PUT',
        body: { direction: 'lose', rateKgPerWeek: 0.5 },
      })
    );
  });

  it('accepts by posting the calories that were shown', async () => {
    await acceptCoachingCheckIn(1800);
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/goals/coaching-checkin/accept',
        method: 'POST',
        body: { calories: 1800 },
      })
    );
  });
});
