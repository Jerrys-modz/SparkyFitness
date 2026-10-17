import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import OfflineQueueBanner, {
  bannerMessage,
} from '../../src/components/OfflineQueueBanner';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import type { OfflineQueueStatus } from '../../src/hooks/useOfflineQueueStatus';

const mockNavigate = jest.fn();
let mockStatus: OfflineQueueStatus;

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  navigationRef: {
    isReady: () => true,
    navigate: (...args: unknown[]) => mockNavigate(...args),
  },
}));
jest.mock('../../src/hooks/useOfflineQueueStatus', () => ({
  useOfflineQueueStatus: () => mockStatus,
}));
jest.mock('../../src/components/Icon', () => 'Icon');
jest.mock('uniwind', () => ({
  useCSSVariable: jest.fn((v: string[]) => v.map(() => '#000')),
}));

const status = (
  overrides: Partial<OfflineQueueStatus>
): OfflineQueueStatus => ({
  pendingCount: 0,
  attentionCount: 0,
  isOffline: false,
  isSyncing: false,
  ...overrides,
});

describe('bannerMessage', () => {
  const t = i18n.t.bind(i18n);

  beforeAll(async () => {
    await initializeI18n('en');
    await i18n.changeLanguage('en');
  });

  it('is silent when there is nothing to say', () => {
    expect(bannerMessage(status({}), t)).toBeNull();
  });

  it('names the count while offline', () => {
    expect(bannerMessage(status({ pendingCount: 3, isOffline: true }), t)).toBe(
      'Offline, 3 waiting to sync'
    );
    expect(bannerMessage(status({ pendingCount: 1, isOffline: true }), t)).toBe(
      'Offline, 1 waiting to sync'
    );
  });

  it('shows progress while syncing and the plain count otherwise', () => {
    expect(bannerMessage(status({ pendingCount: 2, isSyncing: true }), t)).toBe(
      'Syncing 2...'
    );
    expect(bannerMessage(status({ pendingCount: 2 }), t)).toBe(
      '2 waiting to sync'
    );
  });

  it('adds what needs attention, with the singular form', () => {
    expect(
      bannerMessage(status({ pendingCount: 2, attentionCount: 1 }), t)
    ).toBe('2 waiting to sync · 1 needs attention');
    expect(bannerMessage(status({ attentionCount: 3 }), t)).toBe(
      '3 need attention'
    );
  });

  it('says only that the device is offline when nothing is waiting', () => {
    expect(bannerMessage(status({ isOffline: true }), t)).toBe(
      "You're offline"
    );
  });
});

describe('OfflineQueueBanner', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await initializeI18n('en');
    await i18n.changeLanguage('en');
  });

  it('renders nothing when there is nothing to say', () => {
    mockStatus = status({});
    render(<OfflineQueueBanner />);
    expect(screen.toJSON()).toBeNull();
  });

  it('opens the queue screen when tapped', () => {
    mockStatus = status({ pendingCount: 3, isOffline: true });
    render(<OfflineQueueBanner />);

    fireEvent.press(screen.getByText('Offline, 3 waiting to sync'));

    expect(mockNavigate).toHaveBeenCalledWith('OfflineQueue');
  });
});
