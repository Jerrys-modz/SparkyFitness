import type { MoodEntry } from '../../types/mood';
import { apiFetch } from './apiClient';

/** Mood entries filed between two calendar days, inclusive. */
export const fetchMoodEntries = (
  startDate: string,
  endDate: string
): Promise<MoodEntry[]> =>
  apiFetch<MoodEntry[]>({
    endpoint: `/api/mood?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`,
    serviceName: 'Mood API',
    operation: 'fetch mood entries',
  });
