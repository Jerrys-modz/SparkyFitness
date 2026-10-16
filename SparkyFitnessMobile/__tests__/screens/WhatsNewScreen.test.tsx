import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';

import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { initializeI18n } from '../../src/localization/i18n';
import WhatsNewScreen from '../../src/screens/WhatsNewScreen';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(() => ({ top: 0, bottom: 0, left: 0, right: 0 })),
}));

jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: jest.fn(() => 0),
}));

jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: jest.fn(() => false),
}));

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: jest.fn((props: { title: string }) => {
    const React = require('react');
    const { Text } = require('react-native');
    return React.createElement(
      Text,
      { testID: 'screen-header-title' },
      props.title
    );
  }),
}));

jest.mock('../../src/utils/liquidGlass', () => ({
  canUseLiquidGlass: jest.fn(() => false),
}));

jest.mock('../../src/components/Icon', () => {
  const React = require('react');
  const { View } = require('react-native');
  return function MockIcon() {
    return React.createElement(View, { testID: 'mock-icon' });
  };
});

jest.mock('../../src/components/chat/MarkdownMessage', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return function MockMarkdown({ text }: { text: string }) {
    return React.createElement(Text, null, text);
  };
});

jest.mock('uniwind', () => ({
  useCSSVariable: jest.fn((variables: string | string[]) =>
    (Array.isArray(variables) ? variables : [variables]).map(() => '#000000')
  ),
}));

const navigation = {
  navigate: jest.fn(),
} as never;
const route = {
  key: 'WhatsNew-key',
  name: 'WhatsNew',
  params: undefined,
} as never;

describe('WhatsNewScreen localization', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    await initializeI18n('en');
    await i18n.changeLanguage('en');
  });

  it('renders English content and navigates from the medications CTA', () => {
    render(<WhatsNewScreen navigation={navigation} route={route} />);

    expect(screen.getByText("What's New")).toBeTruthy();
    expect(screen.getByText('Track your medications')).toBeTruthy();
    expect(
      screen.getByText('What can I have for dinner with 500 calories left?')
    ).toBeTruthy();

    fireEvent.press(screen.getByText('Set up medications'));
    expect(navigation.navigate).toHaveBeenCalledWith('MedicationsList');
  });

  it('renders the latest release notes from the releases data', () => {
    render(<WhatsNewScreen navigation={navigation} route={route} />);

    expect(screen.getByText('RELEASE NOTES')).toBeTruthy();
    expect(screen.getByText(/^VERSION 1\.8\.0 · /)).toBeTruthy();
    expect(
      screen.getByText('Mindfulness, shortcuts and supplements')
    ).toBeTruthy();
    expect(
      screen.getByText('Health Trends charts now draw your goal for each day.')
    ).toBeTruthy();
  });

  it('lists saved mobile announcements above the release notes', async () => {
    await AsyncStorage.setItem(
      '@WhatsNew:announcementHistory',
      JSON.stringify([
        {
          id: 'mobile-1',
          title: 'Run programs are here',
          message: 'Pick a plan under Library.',
          publishedAt: '2026-10-16T00:00:00.000Z',
        },
      ])
    );
    render(<WhatsNewScreen navigation={navigation} route={route} />);

    expect(await screen.findByText('Run programs are here')).toBeTruthy();
    expect(screen.getByText('Pick a plan under Library.')).toBeTruthy();
    expect(screen.getByText('ANNOUNCEMENTS')).toBeTruthy();
  });

  it('renders Polish feature and mockup copy after switching language', async () => {
    await i18n.changeLanguage('pl');
    render(<WhatsNewScreen navigation={navigation} route={route} />);

    expect(screen.getByText('Co nowego')).toBeTruthy();
    expect(screen.getByText('Monitoruj przyjmowanie leków')).toBeTruthy();
    expect(
      screen.getByText('Co mogę zjeść na kolację, jeśli zostało mi 500 kcal?')
    ).toBeTruthy();
    expect(screen.getByText('08:00')).toBeTruthy();
    expect(screen.getByText('1 515')).toBeTruthy();
  });
});
