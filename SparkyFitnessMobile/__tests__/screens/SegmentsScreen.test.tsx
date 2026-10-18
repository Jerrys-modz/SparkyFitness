import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import SegmentsScreen from '../../src/screens/SegmentsScreen';
import { useSegments } from '../../src/services/segmentService';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/segmentService', () => ({
  useSegments: jest.fn(),
}));
jest.mock('../../src/hooks/useRefetchOnFocus', () => ({
  useRefetchOnFocus: jest.fn(),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const props = {
  navigation,
  route: { key: 'Segments', name: 'Segments' },
} as unknown as RootStackScreenProps<'Segments'>;

const segment = (overrides: Record<string, unknown> = {}) => ({
  id: 's1',
  name: 'Park hill',
  activity: 'run',
  lengthM: 800,
  sourceRouteId: null,
  sourceExerciseEntryId: null,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  start: { lat: 51.5, lon: -0.12 },
  effortCount: 4,
  bestSeconds: 214.4,
  lastEffortDate: '2026-10-12',
  ...overrides,
});
const state = (overrides: Record<string, unknown>) =>
  jest.mocked(useSegments).mockReturnValue({
    segments: [],
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  } as never);

describe('SegmentsScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => jest.clearAllMocks());

  it('explains how to make a first segment', () => {
    state({});
    const screen = render(<SegmentsScreen {...props} />);
    expect(screen.getByTestId('segments-empty')).toBeTruthy();
  });

  it('lists best time, count and last effort, and opens a segment', () => {
    state({
      segments: [
        segment(),
        segment({
          id: 's2',
          name: null,
          effortCount: 1,
          bestSeconds: 61,
          lastEffortDate: '2026-10-01',
        }),
        segment({
          id: 's3',
          name: 'New',
          effortCount: 0,
          bestSeconds: null,
          lastEffortDate: null,
        }),
      ],
    });
    const screen = render(<SegmentsScreen {...props} />);
    expect(screen.getByText('Park hill')).toBeTruthy();
    expect(screen.getByText(/4 efforts · Best 3:34.4 · Last/)).toBeTruthy();
    expect(screen.getByText('Segment · 0.80 km')).toBeTruthy();
    expect(screen.getByText(/^1 effort · Best 1:01.0/)).toBeTruthy();
    expect(screen.getByText('0.80 km · No efforts yet')).toBeTruthy();
    fireEvent.press(screen.getByTestId('segment-row-s1'));
    expect(navigation.navigate).toHaveBeenCalledWith('SegmentDetail', {
      id: 's1',
    });
  });

  it('offers a retry when the list cannot load', () => {
    const refetch = jest.fn();
    state({ isError: true, refetch });
    const screen = render(<SegmentsScreen {...props} />);
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
