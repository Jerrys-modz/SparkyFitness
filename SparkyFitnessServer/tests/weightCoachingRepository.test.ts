import { vi, beforeEach, describe, expect, it } from 'vitest';
import { getClient } from '../db/poolManager.js';
import weightCoachingRepository from '../models/weightCoachingRepository.js';

vi.mock('../db/poolManager.js', () => ({ getClient: vi.fn() }));

const query = vi.fn();
const release = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getClient).mockResolvedValue({ query, release } as never);
});

describe('getCoachingSettings', () => {
  it('returns the stored settings, with the numeric column as a number', async () => {
    query.mockResolvedValue({
      rows: [
        {
          coaching_goal_direction: 'gain',
          coaching_rate_kg_per_week: '0.35',
          coaching_check_in_weekday: 4,
        },
      ],
    });
    expect(
      await weightCoachingRepository.getCoachingSettings('u', 'actor')
    ).toEqual({
      direction: 'gain',
      rateKgPerWeek: 0.35,
      checkInWeekday: 4,
    });
    expect(getClient).toHaveBeenCalledWith('u', 'actor');
    expect(release).toHaveBeenCalled();
  });

  it('falls back to the defaults when there is no preferences row', async () => {
    query.mockResolvedValue({ rows: [] });
    expect(
      await weightCoachingRepository.getCoachingSettings('u', 'u')
    ).toEqual({
      direction: 'maintain',
      rateKgPerWeek: 0.25,
      checkInWeekday: 0,
    });
  });
});

describe('updateCoachingSettings', () => {
  it('passes null for settings left out so they keep their value', async () => {
    query.mockResolvedValue({
      rows: [
        {
          coaching_goal_direction: 'lose',
          coaching_rate_kg_per_week: '0.50',
          coaching_check_in_weekday: 0,
        },
      ],
    });
    const saved = await weightCoachingRepository.updateCoachingSettings('u', {
      direction: 'lose',
      rateKgPerWeek: 0.5,
    });
    expect(query.mock.calls[0]![1]).toEqual(['u', 'lose', 0.5, null]);
    expect(query.mock.calls[0]![0]).toContain('ON CONFLICT (user_id)');
    expect(saved).toEqual({
      direction: 'lose',
      rateKgPerWeek: 0.5,
      checkInWeekday: 0,
    });
    expect(release).toHaveBeenCalled();
  });
});
