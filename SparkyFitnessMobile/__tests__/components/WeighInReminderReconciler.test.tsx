import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';

import WeighInReminderReconciler from '../../src/components/WeighInReminderReconciler';
import { reconcileWeighInReminders } from '../../src/services/weighInReminderService';
import { fetchMeasurements } from '../../src/services/api/measurementsApi';
import {
  __resetAppPreferencesStoreForTests,
  useAppPreferencesStore,
} from '../../src/stores/appPreferencesStore';

jest.mock('../../src/services/weighInReminderService', () => ({
  reconcileWeighInReminders: jest.fn(async () => undefined),
}));

jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchMeasurements: jest.fn(),
}));

const mockReconcile = reconcileWeighInReminders as jest.Mock;
const mockFetch = fetchMeasurements as jest.Mock;

function renderReconciler() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WeighInReminderReconciler />
    </QueryClientProvider>
  );
}

describe('WeighInReminderReconciler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __resetAppPreferencesStoreForTests();
  });

  it('is off by default: reconciles (cancels) without fetching', async () => {
    useAppPreferencesStore.setState({ notificationsEnabled: true });
    renderReconciler();
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledWith(null));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('tells the service a weight is logged for today', async () => {
    mockFetch.mockResolvedValue({ entry_date: '2026-11-16', weight: 80 });
    useAppPreferencesStore.setState({
      notificationsEnabled: true,
      weighInRemindersEnabled: true,
    });
    renderReconciler();
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledWith(true));
    // Never reconciles before the day's answer arrives.
    expect(mockReconcile).not.toHaveBeenCalledWith(null);
  });

  it('keeps today when no weight is logged', async () => {
    mockFetch.mockResolvedValue({ entry_date: '2026-11-16', weight: null });
    useAppPreferencesStore.setState({
      notificationsEnabled: true,
      weighInRemindersEnabled: true,
    });
    renderReconciler();
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledWith(false));
  });

  it('schedules as usual when the day cannot be read', async () => {
    mockFetch.mockRejectedValue(new Error('offline'));
    useAppPreferencesStore.setState({
      notificationsEnabled: true,
      weighInRemindersEnabled: true,
    });
    renderReconciler();
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledWith(null));
  });

  it('reconciles again when the time or days change', async () => {
    mockFetch.mockResolvedValue({ entry_date: '2026-11-16' });
    useAppPreferencesStore.setState({
      notificationsEnabled: true,
      weighInRemindersEnabled: true,
    });
    renderReconciler();
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(1));
    useAppPreferencesStore.getState().setWeighInReminderWeekdays([1]);
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(2));
    useAppPreferencesStore.getState().setWeighInReminderTime('06:15');
    await waitFor(() => expect(mockReconcile).toHaveBeenCalledTimes(3));
  });
});
