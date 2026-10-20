import { apiFetch } from '../../src/services/api/apiClient';
import {
  fetchCustomMoods,
  fetchMoodEntries,
  saveMoodEntry,
} from '../../src/services/api/moodApi';

jest.mock('../../src/services/api/apiClient', () => ({
  apiFetch: jest.fn(),
}));

const mockApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('moodApi', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockApiFetch.mockResolvedValue([]);
  });

  it('lists mood entries for a date range', async () => {
    await fetchMoodEntries('2026-10-01', '2026-10-05');

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/mood?startDate=2026-10-01&endDate=2026-10-05',
      })
    );
  });

  it('posts a mood entry with the snake_case body the server expects', async () => {
    const body = {
      mood_value: 72,
      mood_tags: ['calm'],
      notes: 'ok',
      entry_date: '2026-10-05',
    };

    await saveMoodEntry(body);

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoint: '/api/mood',
        method: 'POST',
        body,
      })
    );
  });

  it('passes energy and focus through when provided', async () => {
    await saveMoodEntry({
      mood_value: 72,
      mood_tags: [],
      notes: '',
      entry_date: '2026-10-05',
      energy_value: 4,
      focus_value: null,
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ energy_value: 4, focus_value: null }),
      })
    );
  });

  it('sends no energy or focus key when the body omits them', async () => {
    await saveMoodEntry({
      mood_value: 72,
      mood_tags: [],
      notes: '',
      entry_date: '2026-10-05',
    });

    const { body } = mockApiFetch.mock.calls[0][0] as {
      body: Record<string, unknown>;
    };
    expect('energy_value' in body).toBe(false);
    expect('focus_value' in body).toBe(false);
  });

  it('lists custom moods', async () => {
    await fetchCustomMoods();

    expect(mockApiFetch).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: '/api/mood/custom' })
    );
  });
});
