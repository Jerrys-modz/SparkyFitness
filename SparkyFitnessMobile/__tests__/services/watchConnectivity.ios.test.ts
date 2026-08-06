const mockListeners: Record<string, ((event: unknown) => void) | undefined> = {};

// Overrides the global jest.setup.js mock (that one just returns inert jest.fn()s)
// so this file can drive `onCommand`/`onReachabilityChange` events manually.
jest.mock(
  'sparky-watch-connectivity',
  () => ({
    __esModule: true,
    default: {
      isSupported: jest.fn(() => true),
      activate: jest.fn(),
      updateContext: jest.fn(() => Promise.resolve()),
      getReachability: jest.fn(() => ({ reachable: true, paired: true, watchAppInstalled: true })),
      addListener: jest.fn((eventName: string, listener: (event: unknown) => void) => {
        mockListeners[eventName] = listener;
        return { remove: jest.fn() };
      }),
    },
  }),
  { virtual: true },
);

jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));

import NativeWatchConnectivity from 'sparky-watch-connectivity';
import { WatchConnectivity } from '../../src/services/watchConnectivity.ios.ts';
import { addLog } from '../../src/services/LogService';

describe('watchConnectivity.ios (real wrapper)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('reflects native isSupported()', () => {
    expect(WatchConnectivity.isAvailable).toBe(true);
    expect(NativeWatchConnectivity.isSupported).toHaveBeenCalled();
  });

  it('activate() delegates to the native module', () => {
    WatchConnectivity.activate();
    expect(NativeWatchConnectivity.activate).toHaveBeenCalledTimes(1);
  });

  it('updateContext() JSON-stringifies the full context for the native module', async () => {
    await WatchConnectivity.updateContext({
      today: null,
      presets: [{ id: 1, name: 'Push', exerciseCount: 3 }],
      activeWorkout: null,
      serverConnected: true,
      generatedAt: 123,
    });

    expect(NativeWatchConnectivity.updateContext).toHaveBeenCalledTimes(1);
    const [json] = (NativeWatchConnectivity.updateContext as jest.Mock).mock.calls[0];
    expect(JSON.parse(json as string)).toEqual({
      today: null,
      presets: [{ id: 1, name: 'Push', exerciseCount: 3 }],
      activeWorkout: null,
      serverConnected: true,
      generatedAt: 123,
    });
  });

  it('logs instead of throwing when the native call rejects', async () => {
    (NativeWatchConnectivity.updateContext as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    await expect(
      WatchConnectivity.updateContext({
        today: null,
        presets: [],
        activeWorkout: null,
        serverConnected: false,
        generatedAt: 0,
      }),
    ).resolves.toBeUndefined();
    expect(addLog).toHaveBeenCalledWith(expect.stringContaining('updateContext failed'), 'WARNING');
  });

  it('parses a valid command payload and forwards it to the listener', () => {
    const listener = jest.fn();
    WatchConnectivity.addCommandListener(listener);

    mockListeners.onCommand?.({ payload: JSON.stringify({ type: 'skipRest' }) });

    expect(listener).toHaveBeenCalledWith({ type: 'skipRest' });
  });

  it('drops a malformed command payload without calling the listener', () => {
    const listener = jest.fn();
    WatchConnectivity.addCommandListener(listener);

    mockListeners.onCommand?.({ payload: 'not json' });
    mockListeners.onCommand?.({ payload: JSON.stringify({ noType: true }) });

    expect(listener).not.toHaveBeenCalled();
    expect(addLog).toHaveBeenCalled();
  });

  it('forwards reachability events verbatim', () => {
    const listener = jest.fn();
    WatchConnectivity.addReachabilityListener(listener);

    const info = { reachable: true, paired: true, watchAppInstalled: false };
    mockListeners.onReachabilityChange?.(info);

    expect(listener).toHaveBeenCalledWith(info);
  });
});
