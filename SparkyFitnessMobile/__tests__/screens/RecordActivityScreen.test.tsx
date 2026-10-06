import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import RecordActivityScreen from '../../src/screens/RecordActivityScreen';
import {
  RecordingPermissionError,
  discardRecording,
  finishRecording,
  pauseRecording,
  startRecording,
  useGpsRecording,
  type RecordingSession,
  type RecordingSnapshot,
} from '../../src/services/gpsRecordingService';
import { saveRecordedActivity } from '../../src/services/gpsRecordingSave';
import { initializeI18n } from '../../src/localization/i18n';
import type { RecordedPoint } from '../../src/utils/gpsRecording';
import type { RootStackScreenProps } from '../../src/types/navigation';

jest.mock('../../src/services/gpsRecordingService', () => {
  class RecordingPermissionError extends Error {
    reason: string;
    constructor(reason: string, message: string) {
      super(message);
      this.reason = reason;
    }
  }
  return {
    RecordingPermissionError,
    useGpsRecording: jest.fn(),
    hydrate: jest.fn(() => Promise.resolve()),
    startRecording: jest.fn(() => Promise.resolve()),
    pauseRecording: jest.fn(() => Promise.resolve()),
    resumeRecording: jest.fn(() => Promise.resolve()),
    finishRecording: jest.fn(() => Promise.resolve()),
    discardRecording: jest.fn(() => Promise.resolve()),
    elapsedSeconds: jest.fn(() => 754),
  };
});
jest.mock('../../src/services/gpsRecordingSave', () => ({
  saveRecordedActivity: jest.fn(),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn(() => null),
}));
jest.mock('../../src/utils/routeMapSupport', () => ({
  canShowRouteMap: () => false,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('uniwind', () => ({
  useCSSVariable: (keys: string | string[]) =>
    Array.isArray(keys) ? keys.map(() => '#111827') : '#111827',
  useUniwind: () => ({ theme: 'light' }),
}));

const mockedState = jest.mocked(useGpsRecording);
const DEG_PER_METER = 1 / 111_194.9;

const session = (
  overrides: Partial<RecordingSession> = {}
): RecordingSession => ({
  id: 'rec-1',
  activity: 'run',
  status: 'recording',
  startedAt: Date.now() - 754_000,
  finishedAt: null,
  pausedAt: null,
  pausedMs: 0,
  seg: 0,
  savedEntryId: null,
  ...overrides,
});

// 2.5 km at 4 m/s.
const track: RecordedPoint[] = Array.from({ length: 11 }, (_, i) => ({
  t: 1_000_000 + i * 62_500,
  lat: 51.5 + i * 250 * DEG_PER_METER,
  lon: -0.12,
  alt: null,
  hacc: 5,
  vacc: null,
  speed: null,
  course: null,
  seg: 0,
}));

const state = (s: RecordingSession | null, points: RecordedPoint[] = []) =>
  mockedState.mockReturnValue({ session: s, points } as RecordingSnapshot);

const navigation = { goBack: jest.fn() };
const props = {
  navigation,
  route: { key: 'RecordActivity', name: 'RecordActivity' },
} as unknown as RootStackScreenProps<'RecordActivity'>;

const renderScreen = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RecordActivityScreen {...props} />
    </QueryClientProvider>
  );

describe('RecordActivityScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => jest.clearAllMocks());

  it('starts a recording of the chosen activity', async () => {
    state(null);
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Ride'));
    fireEvent.press(screen.getByText('Start'));

    await waitFor(() =>
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({ activity: 'ride' })
      )
    );
  });

  it('explains a denied location permission and offers Settings', async () => {
    state(null);
    jest
      .mocked(startRecording)
      .mockRejectedValueOnce(new RecordingPermissionError('denied', 'no'));
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Start'));

    expect(await screen.findByText('Open Settings')).toBeTruthy();
  });

  it('shows the clock, distance and pace while recording, and pauses', async () => {
    state(session(), track);
    const screen = renderScreen();

    expect(screen.getByText('12:34')).toBeTruthy();
    expect(screen.getByText('2.50')).toBeTruthy();
    // 2.5 km in 625 s of fixes: 4 m/s => 4:10 per km.
    expect(screen.getAllByText('4:10').length).toBeGreaterThan(0);

    fireEvent.press(screen.getByText('Pause'));
    await waitFor(() => expect(pauseRecording).toHaveBeenCalled());
  });

  it('finishes from the live screen', async () => {
    state(session(), track);
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Finish'));
    await waitFor(() => expect(finishRecording).toHaveBeenCalled());
  });

  it('lists per-km splits once finished and saves to the diary', async () => {
    state(session({ status: 'finished', finishedAt: Date.now() }), track);
    jest
      .mocked(saveRecordedActivity)
      .mockResolvedValue({ entryId: 'entry-1', entryDate: '2026-10-06' });
    const screen = renderScreen();

    expect(screen.getByText('Splits')).toBeTruthy();
    expect(screen.getByText('1 km')).toBeTruthy();
    expect(screen.getByText('2 km')).toBeTruthy();

    fireEvent.press(screen.getByText('Save activity'));

    await waitFor(() =>
      expect(saveRecordedActivity).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'finished' }),
        track,
        'km'
      )
    );
    await waitFor(() => expect(discardRecording).toHaveBeenCalled());
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('keeps the recording when the save fails', async () => {
    state(session({ status: 'finished', finishedAt: Date.now() }), track);
    jest.mocked(saveRecordedActivity).mockRejectedValue(new Error('offline'));
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Save activity'));

    await waitFor(() => expect(saveRecordedActivity).toHaveBeenCalled());
    expect(discardRecording).not.toHaveBeenCalled();
    expect(navigation.goBack).not.toHaveBeenCalled();
  });

  it('asks before discarding a finished recording', () => {
    state(session({ status: 'finished', finishedAt: Date.now() }), track);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const screen = renderScreen();

    fireEvent.press(screen.getByText('Discard'));

    expect(alert).toHaveBeenCalled();
    expect(discardRecording).not.toHaveBeenCalled();
  });
});
