// Jest resolves the bare `watchConnectivity` specifier to `.ios.ts` by
// default (see AGENTS.md), so the Android/default no-op stub is required
// with its explicit extension here — same pattern as
// `healthConnectService.ts` tests use to reach the Android file.
import { WatchConnectivity } from '../../src/services/watchConnectivity.ts';

describe('watchConnectivity (Android/default stub)', () => {
  it('reports itself unavailable', () => {
    expect(WatchConnectivity.isAvailable).toBe(false);
  });

  it('no-ops every call without throwing', async () => {
    expect(() => WatchConnectivity.activate()).not.toThrow();
    await expect(
      WatchConnectivity.updateContext({
        today: null,
        presets: [],
        activeWorkout: null,
        serverConnected: false,
        generatedAt: 0,
      }),
    ).resolves.toBeUndefined();

    const unsubscribeCommand = WatchConnectivity.addCommandListener(jest.fn());
    const unsubscribeReachability = WatchConnectivity.addReachabilityListener(jest.fn());
    expect(() => unsubscribeCommand()).not.toThrow();
    expect(() => unsubscribeReachability()).not.toThrow();
  });
});
