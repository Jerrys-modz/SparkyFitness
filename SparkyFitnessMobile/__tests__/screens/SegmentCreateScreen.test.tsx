import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import SegmentCreateScreen from '../../src/screens/SegmentCreateScreen';
import { useRoute } from '../../src/services/routeService';
import { saveSegment } from '../../src/services/segmentService';
import { fetchWorkoutGpsPoints } from '../../src/services/api/exerciseStatsApi';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/routeService', () => ({ useRoute: jest.fn() }));
jest.mock('../../src/services/segmentService', () => ({
  saveSegment: jest.fn(() => Promise.resolve({ id: 'new-seg' })),
}));
jest.mock('../../src/services/api/exerciseStatsApi', () => ({
  fetchWorkoutGpsPoints: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/components/exerciseStats/RouteTileMap', () => {
  const { View } = require('react-native');
  return (props: { points: unknown[]; guide?: unknown[] }) => (
    <View
      testID="tile-map"
      accessibilityHint={`${props.points.length}/${props.guide?.length ?? 0}`}
    />
  );
});
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

// A 3 km straight line north.
const M = 111194.93;
const line = Array.from({ length: 31 }, (_, i) => ({
  lat: 51.5 + (i * 100) / M,
  lon: -0.12,
}));

const navigation = {
  goBack: jest.fn(),
  navigate: jest.fn(),
  replace: jest.fn(),
};
const make = (params: Record<string, unknown>) =>
  ({
    navigation,
    route: { key: 'SegmentCreate', name: 'SegmentCreate', params },
  }) as unknown as RootStackScreenProps<'SegmentCreate'>;

const withRoute = (route: unknown, isLoading = false) =>
  jest.mocked(useRoute).mockReturnValue({
    route,
    isLoading,
    isError: false,
    refetch: jest.fn(),
  } as never);

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
const renderWith = (params: Record<string, unknown>) => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <SegmentCreateScreen {...make(params)} />
    </QueryClientProvider>
  );
};

describe('SegmentCreateScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => jest.clearAllMocks());

  it('cuts a stretch of a saved route by distance and replaces itself with the new segment', async () => {
    withRoute({ id: 'r1', activity: 'walk', points: line });
    const screen = renderWith({ routeId: 'r1' });
    // The middle third of 3 km to start.
    expect(screen.getByTestId('segment-start-label').props.children).toBe(
      '1.00 km'
    );
    expect(screen.getByTestId('segment-end-label').props.children).toBe(
      '2.00 km'
    );
    fireEvent.press(screen.getByTestId('segment-nudge-end-forward'));
    fireEvent.changeText(screen.getByTestId('segment-name-input'), ' Hill ');
    fireEvent.press(screen.getByTestId('segment-save'));
    await waitFor(() => expect(saveSegment).toHaveBeenCalled());
    expect(saveSegment).toHaveBeenCalledWith({
      mode: 'route',
      routeId: 'r1',
      startM: expect.closeTo(1000, 0),
      endM: expect.closeTo(2050, 0),
      activity: 'walk',
      name: 'Hill',
    });
    await waitFor(() =>
      expect(navigation.replace).toHaveBeenCalledWith('SegmentDetail', {
        id: 'new-seg',
      })
    );
  });

  it('draws the chosen stretch over the whole route', () => {
    withRoute({ id: 'r1', activity: 'run', points: line });
    const screen = renderWith({ routeId: 'r1' });
    const hint = screen.getByTestId('tile-map').props
      .accessibilityHint as string;
    const [stretch, whole] = hint.split('/').map(Number);
    expect(whole).toBe(31);
    expect(stretch).toBeGreaterThanOrEqual(2);
    expect(stretch).toBeLessThan(whole as number);
  });

  it('cuts from a recorded activity’s track and sends the points', async () => {
    withRoute(undefined);
    jest.mocked(fetchWorkoutGpsPoints).mockResolvedValue({
      points: line.map((p, i) => ({
        ...p,
        t: `2026-10-12T08:00:${String(i).padStart(2, '0')}Z`,
      })),
    } as never);
    const screen = renderWith({ exerciseEntryId: 'e1', activity: 'ride' });
    await waitFor(() =>
      expect(screen.getByTestId('segment-save')).toBeTruthy()
    );
    fireEvent.press(screen.getByTestId('segment-save'));
    await waitFor(() => expect(saveSegment).toHaveBeenCalled());
    const body = jest.mocked(saveSegment).mock.calls[0]?.[0] as {
      mode: string;
      points: unknown[];
      activity: string;
      sourceExerciseEntryId: string;
      name?: string;
    };
    expect(body.mode).toBe('points');
    expect(body.activity).toBe('ride');
    expect(body.sourceExerciseEntryId).toBe('e1');
    expect(body.points.length).toBeGreaterThanOrEqual(2);
    expect(body).not.toHaveProperty('name');
  });

  it('says so when the line is too short for a segment', () => {
    withRoute({
      id: 'r1',
      activity: 'run',
      points: line
        .slice(0, 1)
        .concat(line[1] ? [{ lat: 51.5003, lon: -0.12 }] : []),
    });
    const screen = renderWith({ routeId: 'r1' });
    expect(screen.getByTestId('segment-create-too-short')).toBeTruthy();
    expect(screen.queryByTestId('segment-save')).toBeNull();
  });

  it('keeps the screen and says so when saving fails', async () => {
    withRoute({ id: 'r1', activity: 'run', points: line });
    jest.mocked(saveSegment).mockRejectedValueOnce(new Error('offline'));
    const screen = renderWith({ routeId: 'r1' });
    fireEvent.press(screen.getByTestId('segment-save'));
    await waitFor(() => expect(saveSegment).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.getByTestId('segment-save')).toBeTruthy()
    );
    expect(navigation.replace).not.toHaveBeenCalled();
  });
});
