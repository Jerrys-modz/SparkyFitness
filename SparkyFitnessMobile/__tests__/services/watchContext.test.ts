jest.mock('../../src/services/watchConnectivity', () => ({
  WatchConnectivity: {
    isAvailable: true,
    updateContext: jest.fn(() => Promise.resolve()),
    activate: jest.fn(),
    addCommandListener: jest.fn(() => () => {}),
    addReachabilityListener: jest.fn(() => () => {}),
  },
}));

import {
  resyncWatchContext,
  setWatchActiveWorkout,
  setWatchPresets,
  setWatchServerConnected,
  setWatchToday,
} from '../../src/services/watchContext';
import { WatchConnectivity } from '../../src/services/watchConnectivity';

const updateContextMock = WatchConnectivity.updateContext as jest.Mock;

describe('watchContext', () => {
  beforeEach(() => {
    updateContextMock.mockClear();
    Object.defineProperty(WatchConnectivity, 'isAvailable', {
      get: () => true,
      configurable: true,
    });
    // Reset the module's in-memory slices to a known baseline between tests.
    setWatchToday(null);
    setWatchPresets([]);
    setWatchActiveWorkout(null);
    updateContextMock.mockClear();
  });

  it('sends the full merged context — not just the changed slice — on every setter call', () => {
    setWatchToday({
      date: '2026-08-06',
      food: 1500,
      burned: 200,
      goal: 2500,
      remaining: 1200,
      progress: 0.6,
      protein: 100,
      carbs: 150,
      fat: 50,
    });
    setWatchPresets([{ id: 1, name: 'Push Day', exerciseCount: 3 }]);

    expect(updateContextMock).toHaveBeenCalledTimes(2);
    const lastCall = updateContextMock.mock.calls[1][0];
    // The preset push must not have dropped the today snapshot set moments
    // earlier — updateApplicationContext replaces the whole dictionary, so
    // every push must carry every known slice.
    expect(lastCall.today).toMatchObject({ date: '2026-08-06', food: 1500 });
    expect(lastCall.presets).toEqual([{ id: 1, name: 'Push Day', exerciseCount: 3 }]);
  });

  it('does nothing when WatchConnectivity is unavailable', () => {
    Object.defineProperty(WatchConnectivity, 'isAvailable', {
      get: () => false,
      configurable: true,
    });
    setWatchToday({
      date: '2026-08-06',
      food: 1,
      burned: 1,
      goal: 1,
      remaining: 1,
      progress: 1,
      protein: 1,
      carbs: 1,
      fat: 1,
    });
    expect(updateContextMock).not.toHaveBeenCalled();
  });

  it('skips a no-op serverConnected update', () => {
    setWatchServerConnected(false);
    expect(updateContextMock).not.toHaveBeenCalled();
    setWatchServerConnected(true);
    expect(updateContextMock).toHaveBeenCalledTimes(1);
    updateContextMock.mockClear();
    setWatchServerConnected(true);
    expect(updateContextMock).not.toHaveBeenCalled();
  });

  it('resyncWatchContext resends the last-known state without changing it', () => {
    setWatchPresets([{ id: 2, name: 'Pull Day', exerciseCount: 4 }]);
    updateContextMock.mockClear();

    resyncWatchContext();

    expect(updateContextMock).toHaveBeenCalledTimes(1);
    expect(updateContextMock.mock.calls[0][0].presets).toEqual([
      { id: 2, name: 'Pull Day', exerciseCount: 4 },
    ]);
  });
});
