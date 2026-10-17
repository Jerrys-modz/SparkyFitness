import React from 'react';
import { Alert } from 'react-native';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Toast from 'react-native-toast-message';

import i18n, { initializeI18n } from '../../src/localization/i18n';
import OfflineQueueScreen from '../../src/screens/OfflineQueueScreen';
import { drainQueue } from '../../src/services/offlineQueue/queueRunner';
import { toAttention } from '../../src/services/offlineQueue/queueLogic';
import { useOfflineQueueStore } from '../../src/stores/offlineQueueStore';
import { checkInItem, foodItem, waterItem } from '../helpers/offlineQueue';
import {
  createQueryWrapper,
  createTestQueryClient,
} from '../hooks/queryTestUtils';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
  navigationRef: { isReady: () => true, navigate: jest.fn() },
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: jest.fn(() => false),
}));
jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn((props: { title: string }) => {
    const { Text } = require('react-native');
    return require('react').createElement(Text, null, props.title);
  }),
}));
jest.mock('../../src/hooks/useServerConnection', () => ({
  useServerConnection: jest.fn(() => ({ isConnected: true, isLoading: false })),
}));
jest.mock('../../src/services/offlineQueue/queueRunner', () => ({
  drainQueue: jest.fn(),
}));
jest.mock('../../src/services/LogService', () => ({ addLog: jest.fn() }));
jest.mock('../../src/components/Icon', () => 'Icon');
jest.mock('uniwind', () => ({
  useCSSVariable: jest.fn((v: string | string[]) =>
    Array.isArray(v) ? v.map(() => '#000') : '#000'
  ),
}));

const initialStore = useOfflineQueueStore.getState();
const navigation = {} as never;
const route = { key: 'OfflineQueue-key', name: 'OfflineQueue' } as never;

const renderScreen = () =>
  render(<OfflineQueueScreen navigation={navigation} route={route} />, {
    wrapper: createQueryWrapper(createTestQueryClient()),
  });

describe('OfflineQueueScreen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await initializeI18n('en');
    await i18n.changeLanguage('en');
    useOfflineQueueStore.setState({
      ...initialStore,
      items: [],
      attention: [],
      accounts: {},
      settling: [],
      activeConfigId: 'config-1',
      deviceOffline: false,
      draining: false,
    });
  });

  it('says nothing is waiting when the queue is empty', () => {
    renderScreen();
    expect(screen.getByText('Nothing is waiting to sync.')).toBeTruthy();
    expect(screen.queryByText('Sync now')).toBeNull();
  });

  it('lists what is waiting with the last error of an item that failed', () => {
    useOfflineQueueStore.setState({
      items: [
        { ...foodItem('a'), lastError: 'Server error: 503' },
        waterItem('b'),
        checkInItem('c'),
      ],
    });
    renderScreen();

    expect(screen.getByText('Waiting to sync')).toBeTruthy();
    expect(screen.getByText('Oats')).toBeTruthy();
    expect(screen.getByText('Water')).toBeTruthy();
    expect(screen.getByText('Measurements')).toBeTruthy();
    expect(screen.getByText('Server error: 503')).toBeTruthy();
  });

  it("only shows the active server's items", () => {
    useOfflineQueueStore.setState({
      items: [{ ...foodItem('other'), configId: 'config-2' }],
    });
    renderScreen();
    expect(screen.getByText('Nothing is waiting to sync.')).toBeTruthy();
  });

  it('forces a sync from Sync now and reports how it went', async () => {
    jest
      .mocked(drainQueue)
      .mockResolvedValue({ sent: 2, needsAttention: 0, stopped: 'done' });
    useOfflineQueueStore.setState({ items: [foodItem('a'), waterItem('b')] });
    renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByText('Sync now'));
    });

    expect(drainQueue).toHaveBeenCalledWith({ force: true });
    await waitFor(() =>
      expect(Toast.show).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', text1: 'Synced 2 entries' })
      )
    );
  });

  it('says so when the server still cannot be reached', async () => {
    jest
      .mocked(drainQueue)
      .mockResolvedValue({ sent: 0, needsAttention: 0, stopped: 'network' });
    useOfflineQueueStore.setState({ items: [foodItem('a')] });
    renderScreen();

    await act(async () => {
      fireEvent.press(screen.getByText('Sync now'));
    });

    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({ text1: "Can't reach your server yet" })
    );
  });

  it('shows needs-attention entries with the reason and discards after confirmation', async () => {
    const rejected = toAttention(
      foodItem('bad'),
      'rejected',
      'Invalid meal type',
      0
    );
    const foreign = toAttention(
      foodItem('foreign'),
      'account_mismatch',
      'ignored for this reason',
      0
    );
    await useOfflineQueueStore
      .getState()
      .commit((state) => ({ ...state, attention: [rejected, foreign] }));
    const alert = jest
      .spyOn(Alert, 'alert')
      .mockImplementation(() => undefined);
    renderScreen();

    expect(screen.getByText('Needs attention')).toBeTruthy();
    expect(screen.getByText('Invalid meal type')).toBeTruthy();
    expect(
      screen.getByText(
        'Made while signed in as a different account, so it was not sent.'
      )
    ).toBeTruthy();

    fireEvent.press(screen.getAllByText('Discard')[0]);
    expect(alert).toHaveBeenCalled();
    const buttons = alert.mock.calls[0][2] ?? [];
    await act(async () => {
      buttons.find((b) => b.style === 'destructive')?.onPress?.();
    });

    await waitFor(() =>
      expect(
        useOfflineQueueStore.getState().attention.map((a) => a.id)
      ).toEqual(['foreign'])
    );
  });
});
