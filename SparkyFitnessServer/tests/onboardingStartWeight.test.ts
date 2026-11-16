import { beforeEach, describe, expect, it, vi } from 'vitest';
import onboardingService from '../services/onboardingService.js';
import onboardingRepository from '../models/onboardingRepository.js';
import { loadUserTimezone } from '../utils/timezoneLoader.js';

vi.mock('../models/onboardingRepository.js');
vi.mock('../utils/timezoneLoader.js', () => ({
  loadUserTimezone: vi.fn(),
}));

describe('onboardingService.getStartWeight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(loadUserTimezone).mockResolvedValue('America/Los_Angeles');
  });

  it('returns the weight and the day in the profile timezone', async () => {
    vi.mocked(onboardingRepository.getOnboardingStartWeight).mockResolvedValue({
      current_weight: '92.50',
      // 03:00 UTC is still the previous evening in Los Angeles.
      created_at: new Date('2026-01-16T03:00:00Z'),
    });

    await expect(onboardingService.getStartWeight('u1')).resolves.toEqual({
      weightKg: 92.5,
      date: '2026-01-15',
    });
  });

  it('answers nulls without a row or a usable weight', async () => {
    vi.mocked(onboardingRepository.getOnboardingStartWeight).mockResolvedValue(
      null
    );
    await expect(onboardingService.getStartWeight('u1')).resolves.toEqual({
      weightKg: null,
      date: null,
    });

    vi.mocked(onboardingRepository.getOnboardingStartWeight).mockResolvedValue({
      current_weight: '0',
      created_at: new Date(),
    });
    await expect(onboardingService.getStartWeight('u1')).resolves.toEqual({
      weightKg: null,
      date: null,
    });
  });
});
