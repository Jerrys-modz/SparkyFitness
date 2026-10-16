import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import LabResultDetailScreen from '../../src/screens/LabResultDetailScreen';
import {
  useDeleteLabResult,
  useLabHistory,
  useLabMarkers,
} from '../../src/hooks/useLabResults';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({ show: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/components/labs/LabHistoryChart', () => 'LabHistoryChart');
jest.mock('../../src/hooks/useLabResults', () => ({
  useDeleteLabResult: jest.fn(),
  useLabHistory: jest.fn(),
  useLabMarkers: jest.fn(),
}));

const marker = {
  id: 'cat-1',
  name: 'hba1c',
  display_name: 'HbA1c',
  measurement_type: '%',
  frequency: 'Daily',
  is_lab: true as const,
  ref_range_low: 4,
  ref_range_high: 5.6,
};

// The shape GET /custom-entries?category_id= answers with: row ids, a text
// entry_date, and the joined category.
const rows = [
  {
    id: 'e1',
    category_id: 'cat-1',
    value: '5.1',
    entry_date: '2026-03-01',
    notes: null,
  },
  {
    id: 'e2',
    category_id: 'cat-1',
    value: '6.1',
    entry_date: '2026-09-12',
    notes: 'fasting',
  },
];

const navigation = { navigate: jest.fn(), goBack: jest.fn() } as never;
const route = { params: { categoryId: 'cat-1' } } as never;
const mutate = jest.fn();

describe('LabResultDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useLabMarkers).mockReturnValue({ markers: [marker] } as never);
    jest.mocked(useLabHistory).mockReturnValue({
      data: rows,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    } as never);
    jest.mocked(useDeleteLabResult).mockReturnValue({ mutate } as never);
  });

  it('shows the latest result, its status and every result', () => {
    const { getAllByText, getByText } = render(
      <LabResultDetailScreen navigation={navigation} route={route} />
    );

    // The latest value shows in the summary and again in the list.
    expect(getAllByText('6.1 %', { exact: false })).toHaveLength(2);
    expect(getAllByText('High')).toHaveLength(2);
    expect(getByText('5.1 %')).toBeTruthy();
    expect(getByText(/fasting/)).toBeTruthy();
  });

  it('confirms before deleting a result by its id', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { getAllByText } = render(
      <LabResultDetailScreen navigation={navigation} route={route} />
    );

    fireEvent.press(getAllByText('Delete')[0]);
    const buttons = alert.mock.calls[0][2]!;
    buttons.find((b) => b.style === 'destructive')!.onPress!();

    // Newest first, so the first Delete is the 2026-09-12 result.
    expect(mutate).toHaveBeenCalledWith('e2', expect.anything());
  });
});
