import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WeightPlateauCard from '../../src/components/WeightPlateauCard';
import { useAppPreferencesStore } from '../../src/stores/appPreferencesStore';
import { addDays, getTodayDate } from '../../src/utils/dateUtils';

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});

const mockPreferences = jest.fn();
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: mockPreferences() }),
}));

const mockFetchMeasurementsRange = jest.fn();
jest.mock('../../src/services/api/measurementsApi', () => ({
  fetchMeasurementsRange: (...args: unknown[]) =>
    mockFetchMeasurementsRange(...args),
}));

jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));

const today = getTodayDate();
// Daily weigh-ins over the last 21 days that barely move, newest first as the API sends them.
const flatRows = Array.from({ length: 21 }, (_, i) => ({
  entry_date: addDays(today, -i),
  weight: i % 2 === 0 ? 80.2 : 80,
}));

function renderCard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <WeightPlateauCard />
    </QueryClientProvider>
  );
}

describe('WeightPlateauCard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAppPreferencesStore.setState({ weightPlateauDismissedEnd: null });
    mockPreferences.mockReturnValue({ goal_mode: 'cut' });
    mockFetchMeasurementsRange.mockResolvedValue(flatRows);
  });

  it('shows how long the trend has been flat, with suggestions', async () => {
    const { findByTestId, getByText } = renderCard();
    await findByTestId('weight-plateau-card');
    expect(getByText(/for 21 days \(21 weigh-ins\)/)).toBeTruthy();
    expect(getByText(/Adaptive TDEE/)).toBeTruthy();
    expect(mockFetchMeasurementsRange).toHaveBeenCalledWith(
      addDays(today, -89),
      today
    );
  });

  it('does not fetch or show anything at maintenance', () => {
    mockPreferences.mockReturnValue({ goal_mode: 'maintain' });
    const { queryByTestId } = renderCard();
    expect(queryByTestId('weight-plateau-card')).toBeNull();
    expect(mockFetchMeasurementsRange).not.toHaveBeenCalled();
  });

  it('can be dismissed for this plateau', async () => {
    const { findByTestId, getByTestId, queryByTestId } = renderCard();
    await findByTestId('weight-plateau-card');
    fireEvent.press(getByTestId('weight-plateau-dismiss'));
    await waitFor(() =>
      expect(queryByTestId('weight-plateau-card')).toBeNull()
    );
    expect(useAppPreferencesStore.getState().weightPlateauDismissedEnd).toBe(
      today
    );
  });
});
