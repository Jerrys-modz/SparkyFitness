import * as Network from 'expo-network';
import {
  isDeviceOffline,
  startNetworkMonitor,
} from '../../../src/services/offlineQueue/networkMonitor';
import { useOfflineQueueStore } from '../../../src/stores/offlineQueueStore';

jest.mock('../../../src/services/LogService', () => ({ addLog: jest.fn() }));

type Listener = (state: Network.NetworkState) => void;
const initialStore = useOfflineQueueStore.getState();

const state = (
  isConnected: boolean | undefined,
  isInternetReachable: boolean | undefined
): Network.NetworkState =>
  ({ type: 'WIFI', isConnected, isInternetReachable }) as Network.NetworkState;

describe('isDeviceOffline', () => {
  it('is offline when either flag says so, never on unknown', () => {
    expect(isDeviceOffline(state(false, false))).toBe(true);
    expect(isDeviceOffline(state(true, false))).toBe(true);
    expect(isDeviceOffline(state(false, undefined))).toBe(true);
    expect(isDeviceOffline(state(true, true))).toBe(false);
    expect(isDeviceOffline(state(undefined, undefined))).toBe(false);
    expect(isDeviceOffline(state(true, undefined))).toBe(false);
  });
});

describe('startNetworkMonitor', () => {
  let listener: Listener = () => undefined;
  const remove = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useOfflineQueueStore.setState({ ...initialStore, deviceOffline: false });
    jest
      .mocked(Network.getNetworkStateAsync)
      .mockResolvedValue(state(true, true));
    jest.mocked(Network.addNetworkStateListener).mockImplementation((cb) => {
      listener = cb as Listener;
      return { remove };
    });
  });

  it('reads the current state at start', async () => {
    jest
      .mocked(Network.getNetworkStateAsync)
      .mockResolvedValue(state(false, false));
    const stop = startNetworkMonitor(jest.fn());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(useOfflineQueueStore.getState().deviceOffline).toBe(true);
    stop();
  });

  it('follows changes and calls back only when the connection returns', async () => {
    const onRegained = jest.fn();
    const stop = startNetworkMonitor(onRegained);
    await new Promise((resolve) => setTimeout(resolve, 0));

    listener(state(false, false));
    expect(useOfflineQueueStore.getState().deviceOffline).toBe(true);
    expect(onRegained).not.toHaveBeenCalled();

    listener(state(true, true));
    expect(useOfflineQueueStore.getState().deviceOffline).toBe(false);
    expect(onRegained).toHaveBeenCalledTimes(1);

    listener(state(true, true));
    expect(onRegained).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops listening', () => {
    startNetworkMonitor(jest.fn())();
    expect(remove).toHaveBeenCalled();
  });
});
