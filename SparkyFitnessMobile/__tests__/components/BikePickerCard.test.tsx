import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import type { BikeResponse } from '@workspace/shared';

import BikePickerCard from '../../src/components/BikePickerCard';
import { fetchExerciseEntry } from '../../src/services/api/exerciseStatsApi';
import {
  assignBikeToExerciseEntry,
  fetchBikes,
} from '../../src/services/api/bikesApi';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/services/api/exerciseStatsApi');
jest.mock('../../src/services/api/bikesApi');
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/components/BottomSheetPicker', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: ({
      value,
      options,
      onSelect,
    }: {
      onSelect: (value: string) => void;
      value: string;
      options: { label: string; value: string }[];
    }) => (
      <>
        <Text testID="picker" onPress={() => onSelect('bike-1')}>
          {options.find((option) => option.value === value)?.label}
        </Text>
        <Text testID="clear" onPress={() => onSelect('none')}>
          clear
        </Text>
        <Text testID="options">
          {options.map((option) => option.label).join('|')}
        </Text>
      </>
    ),
  };
});

const bike = (overrides: Partial<BikeResponse>): BikeResponse =>
  ({
    id: 'bike-1',
    name: 'Road',
    status: 'active',
    ...overrides,
  }) as BikeResponse;

const renderCard = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <BikePickerCard exerciseEntryId="entry-1" />
    </QueryClientProvider>
  );
};

beforeAll(async () => {
  await initializeI18n();
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(assignBikeToExerciseEntry).mockResolvedValue({
    exercise_entry_id: 'entry-1',
    bike_id: 'bike-1',
  });
});

describe('BikePickerCard', () => {
  it('stays hidden when there is no bike and none is linked', async () => {
    jest
      .mocked(fetchExerciseEntry)
      .mockResolvedValue({ bike_id: null } as never);
    jest.mocked(fetchBikes).mockResolvedValue([]);
    renderCard();
    await waitFor(() => expect(fetchBikes).toHaveBeenCalled());
    expect(screen.queryByTestId('picker')).toBeNull();
  });

  it('links the chosen bike and clears it with "No bike"', async () => {
    jest
      .mocked(fetchExerciseEntry)
      .mockResolvedValue({ bike_id: null } as never);
    jest.mocked(fetchBikes).mockResolvedValue([bike({})]);
    renderCard();
    await waitFor(() => expect(screen.getByTestId('picker')).toBeTruthy());
    fireEvent.press(screen.getByTestId('picker'));
    await waitFor(() =>
      expect(assignBikeToExerciseEntry).toHaveBeenCalledWith(
        'entry-1',
        'bike-1'
      )
    );
    fireEvent.press(screen.getByTestId('clear'));
    await waitFor(() =>
      expect(assignBikeToExerciseEntry).toHaveBeenLastCalledWith(
        'entry-1',
        null
      )
    );
  });

  it('keeps a retired bike selectable only while the ride is linked to it', async () => {
    jest
      .mocked(fetchExerciseEntry)
      .mockResolvedValue({ bike_id: 'old' } as never);
    jest
      .mocked(fetchBikes)
      .mockResolvedValue([
        bike({ id: 'old', name: 'Old', status: 'retired' }),
        bike({ id: 'other', name: 'Gone', status: 'retired' }),
      ]);
    renderCard();
    await waitFor(() => expect(screen.getByTestId('options')).toBeTruthy());
    const labels = screen.getByTestId('options').props.children as string;
    expect(labels).toContain('Old (Retired)');
    expect(labels).not.toContain('Gone');
  });

  it('shows an error toast when assignment fails', async () => {
    jest
      .mocked(fetchExerciseEntry)
      .mockResolvedValue({ bike_id: null } as never);
    jest.mocked(fetchBikes).mockResolvedValue([bike({})]);
    jest
      .mocked(assignBikeToExerciseEntry)
      .mockRejectedValueOnce(new Error('Offline'));
    renderCard();
    await waitFor(() => expect(screen.getByTestId('picker')).toBeTruthy());
    fireEvent.press(screen.getByTestId('picker'));
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ text1: 'Failed to assign bike' })
      )
    );
  });
});
