import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import SegmentDetailScreen from '../../src/screens/SegmentDetailScreen';
import {
  findSegmentEfforts,
  removeSegment,
  renameSegment,
  useSegmentEfforts,
} from '../../src/services/segmentService';
import { openRunEntry } from '../../src/services/openRunEntry';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/segmentService', () => ({
  useSegmentEfforts: jest.fn(),
  findSegmentEfforts: jest.fn(() => Promise.resolve(2)),
  removeSegment: jest.fn(() => Promise.resolve()),
  renameSegment: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/openRunEntry', () => ({
  openRunEntry: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/components/exerciseStats/RouteTileMap', () => () => null);
jest.mock('../../src/components/segments/SegmentEffortChart', () => {
  const { View } = require('react-native');
  return () => <View testID="effort-chart" />;
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

const navigation = { goBack: jest.fn(), navigate: jest.fn() };
const props = {
  navigation,
  route: { key: 'SegmentDetail', name: 'SegmentDetail', params: { id: 's1' } },
} as unknown as RootStackScreenProps<'SegmentDetail'>;

const effort = (
  entryId: string,
  date: string,
  seconds: number,
  flags = {}
) => ({
  entryId,
  date,
  startedAt: `${date}T08:00:00.000Z`,
  elapsedSeconds: seconds,
  avgSpeedMps: 800 / seconds,
  isBest: false,
  isPersonalRecord: false,
  ...flags,
});
const summary = {
  id: 's1',
  name: 'Park hill',
  activity: 'run',
  lengthM: 800,
  sourceRouteId: null,
  sourceExerciseEntryId: null,
  createdAt: '2026-03-01T10:00:00.000Z',
  updatedAt: '2026-03-01T10:00:00.000Z',
  start: { lat: 51.5, lon: -0.12 },
  effortCount: 3,
  bestSeconds: 200,
  lastEffortDate: '2026-10-12',
};
const load = (efforts: ReturnType<typeof effort>[], overrides = {}) =>
  jest.mocked(useSegmentEfforts).mockReturnValue({
    data: {
      segment: summary,
      points: [
        { lat: 51.5, lon: -0.12 },
        { lat: 51.51, lon: -0.12 },
      ],
      efforts,
    },
    isLoading: false,
    isError: false,
    refetch: jest.fn(),
    ...overrides,
  } as never);

describe('SegmentDetailScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => jest.clearAllMocks());

  it('shows best time, count and last effort', () => {
    load([
      effort('c', '2026-10-12', 200, { isBest: true, isPersonalRecord: true }),
    ]);
    const screen = render(<SegmentDetailScreen {...props} />);
    expect(screen.getByTestId('segment-best').props.children).toBe('3:20.0');
    expect(screen.getByTestId('segment-count').props.children).toBe(3);
    expect(screen.getByText('0.80 km')).toBeTruthy();
  });

  it('charts two or more efforts, marks the best and the records, and shows the gap', () => {
    load([
      effort('c', '2026-10-12', 200, { isBest: true, isPersonalRecord: true }),
      effort('b', '2026-10-05', 230),
      effort('a', '2026-10-01', 220),
    ]);
    const screen = render(<SegmentDetailScreen {...props} />);
    expect(screen.getByTestId('effort-chart')).toBeTruthy();
    expect(screen.getByTestId('segment-best-badge-c')).toBeTruthy();
    expect(screen.getByText(/3:50.0 · \+0:30/)).toBeTruthy();
  });

  it('marks a record that was later beaten with PR, not BEST', () => {
    load([
      effort('c', '2026-10-12', 200, { isBest: true }),
      effort('b', '2026-10-05', 210, { isPersonalRecord: true }),
      effort('a', '2026-10-01', 220),
    ]);
    const screen = render(<SegmentDetailScreen {...props} />);
    expect(screen.getByTestId('segment-pr-badge-b')).toBeTruthy();
    expect(screen.queryByTestId('segment-pr-badge-c')).toBeNull();
  });

  it('draws no chart for a single effort and explains an empty list', () => {
    load([effort('a', '2026-10-01', 220)]);
    expect(
      render(<SegmentDetailScreen {...props} />).queryByTestId('effort-chart')
    ).toBeNull();
    load([]);
    const screen = render(<SegmentDetailScreen {...props} />);
    expect(screen.getByText(/No efforts found yet/)).toBeTruthy();
  });

  it('opens the run behind an effort', () => {
    load([effort('a', '2026-10-01', 220)]);
    const screen = render(<SegmentDetailScreen {...props} />);
    fireEvent.press(screen.getByTestId('segment-effort-a'));
    expect(openRunEntry).toHaveBeenCalledWith(navigation, 'a', 'km');
  });

  it('looks for past efforts on request', async () => {
    load([]);
    const screen = render(<SegmentDetailScreen {...props} />);
    fireEvent.press(screen.getByText('Find past efforts'));
    await waitFor(() => expect(findSegmentEfforts).toHaveBeenCalledWith('s1'));
  });

  it('renames, and clears the name when emptied', async () => {
    load([]);
    const screen = render(<SegmentDetailScreen {...props} />);
    fireEvent.press(screen.getByText('Rename'));
    fireEvent.changeText(screen.getByLabelText('Segment name'), '  Big hill ');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(renameSegment).toHaveBeenCalledWith('s1', 'Big hill')
    );
    fireEvent.press(screen.getByText('Rename'));
    fireEvent.changeText(screen.getByLabelText('Segment name'), '   ');
    fireEvent.press(screen.getByText('Save'));
    await waitFor(() =>
      expect(renameSegment).toHaveBeenLastCalledWith('s1', null)
    );
  });

  it('confirms before deleting', async () => {
    load([]);
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_t, _m, buttons) => {
        buttons?.find((b) => b.style === 'destructive')?.onPress?.();
      });
    const screen = render(<SegmentDetailScreen {...props} />);
    fireEvent.press(screen.getByText('Delete'));
    await waitFor(() => expect(removeSegment).toHaveBeenCalledWith('s1'));
    expect(navigation.goBack).toHaveBeenCalled();
    alert.mockRestore();
  });

  it('offers a retry when the segment cannot load', () => {
    const refetch = jest.fn();
    jest.mocked(useSegmentEfforts).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never);
    const screen = render(<SegmentDetailScreen {...props} />);
    fireEvent.press(screen.getByText('Retry'));
    expect(refetch).toHaveBeenCalled();
  });
});
