import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import Toast from 'react-native-toast-message';
import {
  dailyMoodSeries,
  type MoodCheckinCreateBody,
  type MoodCheckinUpdateBody,
} from '@workspace/shared';
import {
  createMoodCheckin,
  deleteMoodCheckin,
  fetchCustomMoods,
  fetchLegacyMoodEntries,
  fetchMoodCheckinsForDate,
  fetchMoodEntries,
  saveMoodEntry,
  updateMoodCheckin,
  type MoodEntry,
  type SaveMoodEntryBody,
} from '../services/api/moodApi';
import { addLog } from '../services/LogService';
import { addDays, getTodayDate, normalizeDate } from '../utils/dateUtils';
import { RANGE_DAYS, type HealthTrendDateRange } from '../types/healthTrends';
import {
  customMoodsQueryKey,
  cycleCorrelationsQueryKey,
  moodCheckinsQueryKey,
  moodEntriesQueryKey,
  moodEntriesRootQueryKey,
  moodLegacyDayQueryKey,
  moodRatingsSupportQueryKey,
} from './queryKeys';

export type MoodDataPoint = {
  day: string;
  mood: number;
};

export function useMoodEntries(range: HealthTrendDateRange) {
  const today = getTodayDate();
  const startDate = addDays(today, -(RANGE_DAYS[range] - 1));

  const query = useQuery({
    queryKey: moodEntriesQueryKey(startDate, today),
    queryFn: () => fetchMoodEntries(startDate, today),
  });

  const entries = useMemo<MoodEntry[]>(
    () =>
      (query.data ?? [])
        .map((entry) => ({
          ...entry,
          entry_date: normalizeDate(entry.entry_date),
        }))
        .sort((a, b) => a.entry_date.localeCompare(b.entry_date)),
    [query.data]
  );

  const points = useMemo<MoodDataPoint[]>(
    () =>
      dailyMoodSeries(entries).map(({ date, mood_value }) => ({
        day: date,
        mood: mood_value,
      })),
    [entries]
  );

  return {
    entries,
    points,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** Entries between two calendar days (inclusive), with normalized dates. */
export function useMoodEntriesBetween(startDate: string, endDate: string) {
  const query = useQuery({
    queryKey: moodEntriesQueryKey(startDate, endDate),
    queryFn: () => fetchMoodEntries(startDate, endDate),
  });
  return useMemo<MoodEntry[]>(
    () =>
      (query.data ?? []).map((entry) => ({
        ...entry,
        entry_date: normalizeDate(entry.entry_date),
      })),
    [query.data]
  );
}

/** The entry logged for one calendar day, or null when there is none. */
export function useMoodEntryForDate(date: string) {
  const query = useQuery({
    queryKey: moodLegacyDayQueryKey(date),
    queryFn: async () => {
      const entries = await fetchLegacyMoodEntries(date, date);
      return entries[0] ?? null;
    },
  });
  return {
    entry: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

export function useCustomMoods() {
  const query = useQuery({
    queryKey: customMoodsQueryKey,
    queryFn: fetchCustomMoods,
  });
  return query.data ?? [];
}

export function useSaveMood() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: SaveMoodEntryBody) => saveMoodEntry(body),
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: moodEntriesRootQueryKey,
        // A known ratings-support answer only changes with a server upgrade;
        // re-check it only while it is still unknown (no rows saved before).
        predicate: (query) =>
          query.queryKey[1] !== moodRatingsSupportQueryKey[1] ||
          query.state.data == null,
      }),
    onError: (error: Error) => {
      addLog(`[Mood] Failed to save mood entry: ${error.message}`, 'ERROR');
      Toast.show({
        type: 'error',
        text1: t('mood.saveFailed', { defaultValue: 'Could not save mood' }),
      });
    },
  });
}

/** A day's check-ins (v2 servers); null when the server answers the old way. */
export function useMoodCheckinsForDate(date: string) {
  const query = useQuery({
    queryKey: moodCheckinsQueryKey(date),
    queryFn: () => fetchMoodCheckinsForDate(date),
  });
  return {
    checkins: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
  };
}

/** Mood feeds the cycle correlations too, so every write refreshes both. */
function useInvalidateAfterMoodWrite() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: moodEntriesRootQueryKey }),
      queryClient.invalidateQueries({ queryKey: cycleCorrelationsQueryKey }),
    ]);
}

export function useCreateMoodCheckin() {
  const invalidate = useInvalidateAfterMoodWrite();
  return useMutation({
    mutationFn: (body: MoodCheckinCreateBody) => createMoodCheckin(body),
    onSuccess: invalidate,
  });
}

export function useUpdateMoodCheckin() {
  const invalidate = useInvalidateAfterMoodWrite();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MoodCheckinUpdateBody }) =>
      updateMoodCheckin(id, body),
    onSuccess: invalidate,
  });
}

export function useDeleteMoodCheckin() {
  const invalidate = useInvalidateAfterMoodWrite();
  return useMutation({
    mutationFn: (id: string) => deleteMoodCheckin(id),
    onSuccess: invalidate,
  });
}
