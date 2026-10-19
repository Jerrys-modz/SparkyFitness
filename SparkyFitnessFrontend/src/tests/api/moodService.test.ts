import { api } from '@/api/api';
import { saveMoodEntry } from '@/api/CheckIn/moodService';

jest.mock('@/api/api', () => ({
  api: { post: jest.fn().mockResolvedValue({ data: {} }) },
}));

describe('saveMoodEntry', () => {
  test('sends energy and focus ratings, with null for an unselected one', async () => {
    await saveMoodEntry(60, '', '2026-10-20', [], {
      energyValue: null,
      focusValue: 3,
    });
    expect(api.post).toHaveBeenCalledWith(
      '/mood',
      expect.objectContaining({
        body: expect.objectContaining({ energy_value: null, focus_value: 3 }),
      })
    );
  });
});
