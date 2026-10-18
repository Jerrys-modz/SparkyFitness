import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import RecordActivityScreen from '../../src/screens/RecordActivityScreen';
import {
  discardRecording,
  elapsedSeconds,
  startRecording,
  useGpsRecording,
  type RecordingSession,
  type RecordingSnapshot,
} from '../../src/services/gpsRecordingService';
import { useWatchConnectivity } from '../../src/hooks/useWatchConnectivity';
import { startRunOnWatch } from '../../src/services/watchRunControl';
import { useRunProgram } from '../../src/services/runProgramService';
import { saveRecordedActivity } from '../../src/services/gpsRecordingSave';
import { saveFitnessTest } from '../../src/services/fitnessTestService';
import { speakRecordingCue } from '../../src/services/recordingCues';
import { fireSuccessHaptic } from '../../src/services/haptics';
import { initializeI18n } from '../../src/localization/i18n';
import type { RecordedPoint } from '../../src/utils/gpsRecording';
import type { RootStackScreenProps } from '../../src/types/navigation';
import type { FitnessTestType } from '@workspace/shared';
import { fitnessTest } from '../helpers/fitnessTestFixture';

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
    useLatestGpsFix: jest.fn(() => ({ hacc: 6, t: Date.now() })),
    hydrate: jest.fn(() => Promise.resolve()),
    markLap: jest.fn(() => Promise.resolve(1)),
    startRecording: jest.fn(() => Promise.resolve()),
    pauseRecording: jest.fn(() => Promise.resolve()),
    resumeRecording: jest.fn(() => Promise.resolve()),
    setRecordingAutoPause: jest.fn(() => Promise.resolve()),
    setRecordingAudioCues: jest.fn(() => Promise.resolve()),
    finishRecording: jest.fn(() => Promise.resolve()),
    discardRecording: jest.fn(() => Promise.resolve()),
    getHeartRateSamples: jest.fn(() => Promise.resolve([])),
    elapsedSeconds: jest.fn(() => 300),
    getRecordingPreferences: jest.fn(() =>
      Promise.resolve({
        autoPause: true,
        audioCues: false,
        paceBand: null,
        heartRateBand: null,
        countdownSeconds: 0,
      })
    ),
    setRecordingPreference: jest.fn(() => Promise.resolve()),
    setCountdownPreference: jest.fn(() => Promise.resolve()),
    setPaceBandPreference: jest.fn(() => Promise.resolve()),
    setRecordingPaceBand: jest.fn(() => Promise.resolve()),
    setHeartRateBandPreference: jest.fn(() => Promise.resolve()),
    setRecordingHeartRateBand: jest.fn(() => Promise.resolve()),
    COUNTDOWN_CHOICES: [0, 3, 5, 10],
  };
});
jest.mock('../../src/hooks/useWatchConnectivity', () => ({
  useWatchConnectivity: jest.fn(() => ({
    isSupported: false,
    isPaired: false,
    isReachable: false,
  })),
}));
jest.mock('../../src/services/watchRunControl', () => ({
  startRunOnWatch: jest.fn(() => Promise.resolve('q1')),
}));
jest.mock('../../src/services/runProgramService', () => ({
  useRunProgram: jest.fn(),
  completeProgramWorkout: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../src/services/fitnessTestService', () => ({
  saveFitnessTest: jest.fn(),
}));
jest.mock('../../src/services/recordingCues', () => ({
  beginRecordingCues: jest.fn(),
  speakRecordingCue: jest.fn(),
  stopRecordingCues: jest.fn(),
}));
jest.mock('../../src/services/haptics', () => ({
  fireSelectionHaptic: jest.fn(),
  fireSuccessHaptic: jest.fn(),
}));
jest.mock('../../src/services/gpsRecordingSave', () => ({
  saveRecordedActivity: jest.fn(),
}));
jest.mock('../../src/hooks/useIndoorDistanceEstimate', () => ({
  useIndoorDistanceEstimate: jest.fn(() => null),
}));
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: { default_distance_unit: 'km' } }),
}));
jest.mock('../../src/hooks/useSuggestedRanges', () => ({
  useSuggestedRanges: () => ({ pace: null, heartRate: null, byEffort: null }),
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

const DEG_PER_METER = 1 / 111_194.9;
const START = new Date(2026, 9, 18, 8, 0, 0).getTime();

const session = (
  overrides: Partial<RecordingSession> = {}
): RecordingSession => ({
  id: 'rec-1',
  activity: 'run',
  status: 'recording',
  startedAt: START,
  finishedAt: null,
  pausedAt: null,
  pausedMs: 0,
  seg: 0,
  savedEntryId: null,
  ...overrides,
});

/** A fix every 10 s going north at `mps` for `seconds`. */
const track = (seconds: number, mps: number): RecordedPoint[] =>
  Array.from({ length: seconds / 10 + 1 }, (_, i) => ({
    t: START + i * 10_000,
    lat: 51.5 + i * 10 * mps * DEG_PER_METER,
    lon: -0.12,
    alt: null,
    hacc: 5,
    vacc: null,
    speed: null,
    course: null,
    seg: 0,
  }));

const state = (s: RecordingSession | null, points: RecordedPoint[] = []) =>
  jest
    .mocked(useGpsRecording)
    .mockReturnValue({ session: s, points } as RecordingSnapshot);

const navigation = {
  goBack: jest.fn(),
  replace: jest.fn(),
  navigate: jest.fn(),
};

const renderScreen = async (fitnessTestParam?: FitnessTestType) => {
  const props = {
    navigation,
    route: {
      key: 'RecordActivity',
      name: 'RecordActivity',
      params: fitnessTestParam ? { fitnessTest: fitnessTestParam } : undefined,
    },
  } as unknown as RootStackScreenProps<'RecordActivity'>;
  const screen = render(
    <QueryClientProvider client={new QueryClient()}>
      <RecordActivityScreen {...props} />
    </QueryClientProvider>
  );
  await waitFor(() =>
    expect(screen.queryByTestId('record-activity-loading')).toBeNull()
  );
  return screen;
};

describe('RecordActivityScreen fitness test', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(elapsedSeconds).mockReturnValue(300);
    jest.mocked(useRunProgram).mockReturnValue({
      status: null,
      enabled: false,
      lastAdjustment: null,
      schedule: { days: [], startDay: null, endDay: null },
      doneDay: null,
      loaded: true,
      refetch: jest.fn(() => Promise.resolve()),
    } as never);
  });

  describe('before Start', () => {
    it('shows the guided test instead of the ordinary setup', async () => {
      state(null);
      const screen = await renderScreen('cooper');
      expect(screen.getByTestId('fitness-test-setup')).toBeTruthy();
      expect(screen.getByText('12-minute Cooper test')).toBeTruthy();
      // None of the ordinary choices apply to a test.
      expect(screen.queryByText('Outdoor')).toBeNull();
      expect(screen.queryByTestId('auto-pause-switch')).toBeNull();
      expect(screen.queryByText('Intervals')).toBeNull();
    });

    it('records a plain outdoor run marked as the chosen test', async () => {
      state(null);
      const screen = await renderScreen('30min');
      fireEvent.press(screen.getByTestId('fitness-test-start'));
      await waitFor(() => expect(startRecording).toHaveBeenCalled());
      expect(startRecording).toHaveBeenCalledWith(
        expect.objectContaining({
          activity: 'run',
          fitnessTest: '30min',
          indoor: false,
          // Pauses would take time out of a timed test.
          autoPause: false,
        })
      );
      // No plan, pace alert or program comes with a test.
      const options = jest.mocked(startRecording).mock.calls[0][0];
      expect(options).not.toHaveProperty('intervals');
      expect(options).not.toHaveProperty('program');
      expect(options).not.toHaveProperty('paceBand');
    });

    it('records on the phone even with a watch paired', async () => {
      jest.mocked(useWatchConnectivity).mockReturnValue({
        isSupported: true,
        isPaired: true,
        isReachable: true,
      } as never);
      state(null);
      const screen = await renderScreen('5k');
      fireEvent.press(screen.getByTestId('fitness-test-start'));
      await waitFor(() => expect(startRecording).toHaveBeenCalled());
      expect(startRunOnWatch).not.toHaveBeenCalled();
    });

    it('is the ordinary screen when opened without a test', async () => {
      state(null);
      const screen = await renderScreen();
      expect(screen.queryByTestId('fitness-test-setup')).toBeNull();
      expect(screen.getByText('Outdoor')).toBeTruthy();
    });
  });

  describe('while recording', () => {
    it('guides the test being run', async () => {
      state(session({ fitnessTest: '5k' }), track(300, 5));
      const screen = await renderScreen();
      expect(screen.getByTestId('fitness-test-card')).toBeTruthy();
      expect(screen.getByTestId('fitness-test-guidance').props.children).toBe(
        'Run evenly and hard. 3.50 km to go until 5 km.'
      );
    });

    it('shows no test card for an ordinary run', async () => {
      state(session(), track(300, 5));
      const screen = await renderScreen();
      expect(screen.queryByTestId('fitness-test-card')).toBeNull();
    });

    it('buzzes and speaks when the test reaches its mark', async () => {
      // 12 minutes of active time on the clock: the Cooper test is done.
      jest.mocked(elapsedSeconds).mockReturnValue(720);
      state(session({ fitnessTest: 'cooper', audioCues: 'km' }), track(720, 4));
      const screen = await renderScreen();
      expect(screen.getByTestId('fitness-test-guidance').props.children).toBe(
        'Test complete. Slow down and tap Finish.'
      );
      expect(fireSuccessHaptic).toHaveBeenCalledTimes(1);
      expect(speakRecordingCue).toHaveBeenCalledWith(
        'Test complete. Slow down and finish.'
      );
    });

    it('buzzes without speaking when voice cues are off', async () => {
      jest.mocked(elapsedSeconds).mockReturnValue(720);
      state(session({ fitnessTest: 'cooper' }), track(720, 4));
      await renderScreen();
      expect(fireSuccessHaptic).toHaveBeenCalledTimes(1);
      expect(speakRecordingCue).not.toHaveBeenCalled();
    });

    it('stays quiet before the mark', async () => {
      state(session({ fitnessTest: 'cooper' }), track(300, 4));
      await renderScreen();
      expect(fireSuccessHaptic).not.toHaveBeenCalled();
    });
  });

  describe('after Finish', () => {
    const finished = (type: FitnessTestType) =>
      session({
        status: 'finished',
        finishedAt: START + 1_100_000,
        fitnessTest: type,
      });

    it('files the test against the saved activity and opens the result', async () => {
      // 5 m/s: 5 km at 1000 s, then a minute and a half of cooling down.
      state(finished('5k'), track(1090, 5));
      jest.mocked(saveRecordedActivity).mockResolvedValue({
        entryId: 'entry-1',
        entryDate: '2026-10-18',
      } as never);
      jest
        .mocked(saveFitnessTest)
        .mockResolvedValue(fitnessTest({ id: 'saved-test' }));
      const screen = await renderScreen();
      expect(screen.getByTestId('fitness-test-finished')).toBeTruthy();
      expect(
        screen.getByText(/Threshold pace .*Saving sets your training paces/)
      ).toBeTruthy();

      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith('FitnessTestResult', {
          id: 'saved-test',
        })
      );
      expect(saveFitnessTest).toHaveBeenCalledWith({
        test_type: '5k',
        test_date: '2026-10-18',
        distance_meters: 5000,
        duration_seconds: 1000,
        split_distance_meters: null,
        exercise_entry_id: 'entry-1',
      });
      // The activity is saved first, so the test can name it.
      expect(
        jest.mocked(saveRecordedActivity).mock.invocationCallOrder[0]
      ).toBeLessThan(jest.mocked(saveFitnessTest).mock.invocationCallOrder[0]);
      expect(discardRecording).toHaveBeenCalled();
    });

    it('sends the 10-minute split of a 30-minute run', async () => {
      state(finished('30min'), track(1800, 4));
      jest.mocked(saveRecordedActivity).mockResolvedValue({
        entryId: 'entry-1',
        entryDate: '2026-10-18',
      } as never);
      jest.mocked(saveFitnessTest).mockResolvedValue(fitnessTest());
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(saveFitnessTest).toHaveBeenCalledWith(
        expect.objectContaining({
          test_type: '30min',
          distance_meters: 7200,
          split_distance_meters: 2400,
          duration_seconds: 1800,
        })
      );
    });

    it('saves a test stopped early as an ordinary run', async () => {
      state(finished('5k'), track(600, 5));
      jest.mocked(saveRecordedActivity).mockResolvedValue({
        entryId: 'entry-1',
        entryDate: '2026-10-18',
      } as never);
      const screen = await renderScreen();
      expect(screen.getByText(/saved as an ordinary run/)).toBeTruthy();

      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() =>
        expect(navigation.replace).toHaveBeenCalledWith(
          'RunSummary',
          expect.anything()
        )
      );
      expect(saveFitnessTest).not.toHaveBeenCalled();
    });

    it('keeps the recording when the test cannot be saved', async () => {
      state(finished('5k'), track(1090, 5));
      jest.mocked(saveRecordedActivity).mockResolvedValue({
        entryId: 'entry-1',
        entryDate: '2026-10-18',
      } as never);
      jest.mocked(saveFitnessTest).mockRejectedValue(new Error('offline'));
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(saveFitnessTest).toHaveBeenCalled());
      expect(discardRecording).not.toHaveBeenCalled();
      expect(navigation.replace).not.toHaveBeenCalled();
    });

    it('files no test for an ordinary run', async () => {
      state(
        session({ status: 'finished', finishedAt: START + 600_000 }),
        track(600, 4)
      );
      jest.mocked(saveRecordedActivity).mockResolvedValue({
        entryId: 'entry-1',
        entryDate: '2026-10-18',
      } as never);
      const screen = await renderScreen();
      fireEvent.press(screen.getByText('Save activity'));
      await waitFor(() => expect(navigation.replace).toHaveBeenCalled());
      expect(saveFitnessTest).not.toHaveBeenCalled();
    });
  });
});
