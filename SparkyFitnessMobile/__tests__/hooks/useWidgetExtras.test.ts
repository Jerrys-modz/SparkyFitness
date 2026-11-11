import { renderHook } from '@testing-library/react-native';

import { useWidgetExtras } from '../../src/hooks/useWidgetExtras';

const mockUseCurrentFast = jest.fn();
const mockUseSleepDay = jest.fn();
const mockUseHeartRateRange = jest.fn();
const mockUseHeartRateSamples = jest.fn();
const mockUseLoggingStreak = jest.fn();
let mockCustomWidgetActive = false;

jest.mock('../../src/hooks/useCustomWidgetActive', () => ({
  useCustomWidgetActive: () => mockCustomWidgetActive,
}));

jest.mock('../../src/hooks/useFasting', () => ({
  useCurrentFast: (options: unknown) => mockUseCurrentFast(options),
}));
jest.mock('../../src/hooks/useSleepDay', () => ({
  useSleepDay: (...args: unknown[]) => mockUseSleepDay(...args),
}));
jest.mock('../../src/hooks/useHeartRateRange', () => ({
  useHeartRateRange: (options: unknown) => mockUseHeartRateRange(options),
}));
jest.mock('../../src/hooks/useHeartRateTimelines', () => ({
  useHeartRateSamples: (...args: unknown[]) => mockUseHeartRateSamples(...args),
}));
jest.mock('../../src/hooks/useLoggingStreak', () => ({
  useLoggingStreak: (...args: unknown[]) => mockUseLoggingStreak(...args),
}));

const DAY = '2026-11-09';

const placeWidget = () => {
  mockCustomWidgetActive = true;
};

const checkIn = (overrides = {}) => ({
  entry_date: DAY,
  steps: 6420,
  weight: 80.5,
  ...overrides,
});

const run = (overrides: Partial<Parameters<typeof useWidgetExtras>[0]> = {}) =>
  renderHook(() =>
    useWidgetExtras({
      measurements: undefined,
      date: DAY,
      enabled: true,
      ...overrides,
    })
  );

describe('useWidgetExtras', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCurrentFast.mockReturnValue({ data: undefined });
    mockUseSleepDay.mockReturnValue({ wakeUp: null });
    mockUseHeartRateRange.mockReturnValue({ heartRateData: [] });
    mockUseHeartRateSamples.mockReturnValue({ data: undefined });
    mockUseLoggingStreak.mockReturnValue(undefined);
    mockCustomWidgetActive = false;
  });

  describe('steps and weight', () => {
    it('come from the day check-in', () => {
      const { result } = run({ measurements: checkIn() });
      expect(result.current).toMatchObject({ steps: 6420, weightKg: 80.5 });
    });

    it('carry the account weight unit through for the widget', () => {
      const { result } = run({
        measurements: checkIn(),
        weightUnit: 'st_lbs',
      });
      expect(result.current.weightUnit).toBe('st_lbs');
    });

    it('carry the account water unit through for the widget', () => {
      const { result } = run({ waterUnit: 'oz' });
      expect(result.current.waterUnit).toBe('oz');
    });

    it('ignore a check-in from another day', () => {
      const { result } = run({
        measurements: checkIn({ entry_date: '2026-11-08' }),
      });
      expect(result.current.steps).toBeUndefined();
      expect(result.current.weightKg).toBeUndefined();
    });

    it('treat zero and missing figures as absent, never as a real zero', () => {
      const { result } = run({
        measurements: checkIn({ steps: 0, weight: null }),
      });
      expect(result.current.steps).toBeUndefined();
      expect(result.current.weightKg).toBeUndefined();
    });
  });

  describe('nothing extra is fetched without a custom widget on a screen', () => {
    it('switches every optional source off', () => {
      run();
      expect(mockUseCurrentFast).toHaveBeenLastCalledWith({ enabled: false });
      expect(mockUseSleepDay).toHaveBeenLastCalledWith(DAY, { enabled: false });
      expect(mockUseHeartRateRange).toHaveBeenLastCalledWith({
        range: '7d',
        enabled: false,
      });
      expect(mockUseHeartRateSamples).toHaveBeenLastCalledWith(DAY, DAY, false);
      expect(mockUseLoggingStreak).toHaveBeenLastCalledWith(DAY, false);
    });

    it('stays off while the server is not connected', () => {
      placeWidget();
      run({ enabled: false });
      expect(mockUseCurrentFast).toHaveBeenLastCalledWith({ enabled: false });
      expect(mockUseSleepDay).toHaveBeenLastCalledWith(DAY, { enabled: false });
      expect(mockUseLoggingStreak).toHaveBeenLastCalledWith(DAY, false);
    });

    it('stays off before the day is known', () => {
      placeWidget();
      run({ date: undefined });
      expect(mockUseSleepDay).toHaveBeenLastCalledWith('', { enabled: false });
    });
  });

  describe('fasting timer', () => {
    const fast = (overrides = {}) => ({
      start_time: '2026-11-09T04:00:00.000Z',
      target_end_time: null,
      is_eating_window: false,
      ...overrides,
    });

    it('returns the start of a running fast', () => {
      placeWidget();
      mockUseCurrentFast.mockReturnValue({ data: fast() });
      const { result } = run();
      expect(mockUseCurrentFast).toHaveBeenLastCalledWith({ enabled: true });
      expect(result.current.fastStartedAt).toBe(
        new Date('2026-11-09T04:00:00.000Z').getTime()
      );
    });

    it('does not count an eating window as a fast', () => {
      placeWidget();
      mockUseCurrentFast.mockReturnValue({
        data: fast({ is_eating_window: true }),
      });
      expect(run().result.current.fastStartedAt).toBeUndefined();
    });
  });

  describe('sleep', () => {
    it('uses time asleep, in minutes', () => {
      placeWidget();
      mockUseSleepDay.mockReturnValue({
        wakeUp: {
          time_asleep_in_seconds: 7 * 3600 + 20 * 60,
          duration_in_seconds: 8 * 3600,
        },
      });
      expect(run().result.current.sleepMinutes).toBe(440);
      expect(mockUseSleepDay).toHaveBeenLastCalledWith(DAY, { enabled: true });
    });

    it('is absent with no sleep synced', () => {
      placeWidget();
      expect(run().result.current.sleepMinutes).toBeUndefined();
    });
  });

  describe('resting heart rate', () => {
    it('is the newest reading in the window', () => {
      placeWidget();
      mockUseHeartRateRange.mockReturnValue({
        heartRateData: [
          { day: '2026-11-05', restingHr: 58 },
          { day: '2026-11-07', restingHr: 54 },
          { day: '2026-11-08', restingHr: 0 },
        ],
      });
      expect(run().result.current.restingHeartRate).toBe(54);
    });

    it('is absent when the window has none', () => {
      placeWidget();
      expect(run().result.current.restingHeartRate).toBeUndefined();
    });
  });

  describe('heart rate', () => {
    it("is today's average", () => {
      placeWidget();
      mockUseHeartRateSamples.mockReturnValue({
        data: [
          { entry_date: DAY, samples: [{ bpm: 60 }, { bpm: 80 }] },
          { entry_date: '2026-11-08', samples: [{ bpm: 100 }] },
        ],
      });
      expect(run().result.current.heartRate).toBe(70);
      expect(mockUseHeartRateSamples).toHaveBeenLastCalledWith(DAY, DAY, true);
    });

    it('is absent with no readings today', () => {
      placeWidget();
      mockUseHeartRateSamples.mockReturnValue({
        data: [{ entry_date: '2026-11-08', samples: [{ bpm: 100 }] }],
      });
      expect(run().result.current.heartRate).toBeUndefined();
    });
  });

  describe('logging streak', () => {
    it('passes the streak through when a custom widget is placed', () => {
      placeWidget();
      mockUseLoggingStreak.mockReturnValue(9);
      expect(run().result.current.loggingStreakDays).toBe(9);
      expect(mockUseLoggingStreak).toHaveBeenLastCalledWith(DAY, true);
    });

    it('drops a streak when no custom widget is placed', () => {
      mockUseLoggingStreak.mockReturnValue(9);
      expect(run().result.current.loggingStreakDays).toBeUndefined();
    });
  });
});
