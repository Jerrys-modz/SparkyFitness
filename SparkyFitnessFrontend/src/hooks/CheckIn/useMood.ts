import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import i18n from 'i18next';
import type {
  MoodCheckinCreateBody,
  MoodCheckinUpdateBody,
} from '@workspace/shared';
import {
  saveMoodEntry,
  getMoodCheckinsByDate,
  createMoodCheckin,
  updateMoodCheckin,
  deleteMoodCheckin,
  getMoodEntries,
  getMoodEntryByDate,
  listCustomMoods,
  createCustomMood,
  deleteCustomMood,
  getMoodDisplayPreferences,
  updateMoodDisplayPreferences,
} from '@/api/CheckIn/moodService';
import { moodKeys } from '@/api/keys/checkin';

export const useMoodEntries = (
  startDate: string,
  endDate: string,
  userId?: string
) => {
  return useQuery({
    queryKey: moodKeys.list(startDate, endDate, userId),
    queryFn: () => getMoodEntries(startDate, endDate, userId),
    meta: {
      errorMessage: i18n.t(
        'mood.failedToLoadEntries',
        'Failed to load mood entries.'
      ),
    },
  });
};

export const useMoodEntryByDate = (entryDate: string) => {
  return useQuery({
    queryKey: moodKeys.byDate(entryDate),
    queryFn: () => getMoodEntryByDate(entryDate),
    meta: {
      errorMessage: i18n.t(
        'mood.failedToLoadEntry',
        'Failed to load mood entry.'
      ),
    },
  });
};

export const useSaveMoodEntryMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      moodValue,
      notes,
      entryDate,
      moodTags,
      energyValue,
      focusValue,
    }: {
      moodValue: number;
      notes: string;
      entryDate: string;
      moodTags?: string[];
      energyValue: number | null;
      focusValue: number | null;
    }) =>
      saveMoodEntry(moodValue, notes, entryDate, moodTags, {
        energyValue,
        focusValue,
      }),
    onSuccess: () => {
      return queryClient.invalidateQueries({ queryKey: moodKeys.all });
    },
    meta: {
      errorMessage: i18n.t('mood.failedToSave', 'Failed to save mood entry.'),
      successMessage: i18n.t(
        'mood.savedSuccessfully',
        'Mood entry saved successfully.'
      ),
    },
  });
};

export const useMoodCheckinsByDate = (date: string) =>
  useQuery({
    queryKey: moodKeys.byDate(date),
    queryFn: () => getMoodCheckinsByDate(date),
    meta: {
      errorMessage: i18n.t(
        'mood.failedToLoadEntries',
        'Failed to load mood entries.'
      ),
    },
  });

export const useCreateMoodCheckinMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: MoodCheckinCreateBody) => createMoodCheckin(body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: moodKeys.all }),
    meta: {
      errorMessage: i18n.t('mood.failedToSave', 'Failed to save mood entry.'),
      successMessage: i18n.t(
        'mood.savedSuccessfully',
        'Mood entry saved successfully.'
      ),
    },
  });
};

export const useUpdateMoodCheckinMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: MoodCheckinUpdateBody }) =>
      updateMoodCheckin(id, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: moodKeys.all }),
    meta: {
      errorMessage: i18n.t(
        'mood.failedToUpdate',
        'Failed to update mood entry.'
      ),
      successMessage: i18n.t(
        'mood.updatedSuccessfully',
        'Mood entry updated successfully.'
      ),
    },
  });
};

export const useDeleteMoodCheckinMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMoodCheckin(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: moodKeys.all }),
    meta: {
      errorMessage: i18n.t(
        'mood.failedToDelete',
        'Failed to delete mood entry.'
      ),
      successMessage: i18n.t(
        'mood.deletedSuccessfully',
        'Mood entry deleted successfully.'
      ),
    },
  });
};

// --- Custom moods (user-defined mood tags) ---------------------------------

export const useCustomMoods = () =>
  useQuery({
    queryKey: ['custom-moods'],
    queryFn: () => listCustomMoods(),
    meta: {
      errorMessage: i18n.t('mood.failedToLoadCustom', 'Failed to load moods.'),
    },
  });

export const useCreateCustomMoodMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      display_name?: string;
      icon?: string;
      color?: string;
    }) => createCustomMood(body),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['custom-moods'] }),
    meta: {
      errorMessage: i18n.t('mood.failedAddCustom', 'Could not add mood.'),
    },
  });
};

export const useDeleteCustomMoodMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      deleteAllHistory,
    }: {
      id: string;
      deleteAllHistory?: boolean;
    }) => deleteCustomMood(id, deleteAllHistory),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['custom-moods'] });
      queryClient.invalidateQueries({ queryKey: moodKeys.all });
    },
    meta: {
      errorMessage: i18n.t('mood.failedDeleteCustom', 'Could not remove mood.'),
    },
  });
};

export const useMoodDisplayPreferences = () =>
  useQuery({
    queryKey: ['mood-display-preferences'],
    queryFn: () => getMoodDisplayPreferences(),
    meta: {
      errorMessage: i18n.t(
        'mood.failedLoadPrefs',
        'Failed to load mood prefs.'
      ),
    },
  });

export const useUpdateMoodDisplayPreferencesMutation = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (hiddenMoods: string[]) =>
      updateMoodDisplayPreferences(hiddenMoods),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['mood-display-preferences'] }),
    meta: {
      errorMessage: i18n.t('mood.failedSavePrefs', 'Could not update moods.'),
    },
  });
};
