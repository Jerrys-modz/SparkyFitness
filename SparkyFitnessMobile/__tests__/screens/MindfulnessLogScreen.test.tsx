import React from 'react';
import { Platform } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import type { MindfulnessSessionResponse } from '@workspace/shared';
import MindfulnessLogScreen from '../../src/screens/MindfulnessLogScreen';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';

type ScreenProps = RootStackScreenProps<'MindfulnessLog'>;

const mockSaveSession = jest.fn();
const mockUpdateSession = jest.fn();
jest.mock('../../src/hooks/useMindfulness', () => ({
  useMindfulnessMutations: () => ({
    saveSession: mockSaveSession,
    updateSession: mockUpdateSession,
  }),
}));

// The Android layout: header and sticky Save drawn by the screen itself.
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  ...jest.requireActual('../../src/services/nativeTabBarPreference'),
  useNativeIOSHeadersActive: () => false,
}));

jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ name }: { name: string }) => <View testID={`icon-${name}`} />,
  };
});

const mockIsFocused = jest.fn(() => true);
const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  isFocused: mockIsFocused,
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const DATE = '2026-10-14';
const frame = { x: 0, y: 0, width: 390, height: 844 };

/** Roughly what Android reports under edge-to-edge with 3-button navigation. */
const ANDROID_INSETS = { top: 24, bottom: 48, left: 0, right: 0 };

const renderScreen = (params: ScreenProps['route']['params']) =>
  render(
    <SafeAreaProvider initialMetrics={{ insets: ANDROID_INSETS, frame }}>
      <MindfulnessLogScreen
        navigation={mockNavigation}
        route={{ key: 'MindfulnessLog-key', name: 'MindfulnessLog', params }}
      />
    </SafeAreaProvider>
  );

/** The padding the nearest ancestor of `text` sets on `side`. */
const paddingAbove = (
  text: string,
  side: 'paddingTop' | 'paddingBottom'
): number | undefined => {
  let node = screen.getByText(text).parent;
  while (node) {
    const style = node.props?.style;
    const flat = Array.isArray(style) ? Object.assign({}, ...style) : style;
    if (typeof flat?.[side] === 'number') return flat[side];
    node = node.parent;
  }
  return undefined;
};

const session: MindfulnessSessionResponse = {
  id: 'session-1',
  user_id: 'user-1',
  entry_date: DATE,
  start_time: null,
  end_time: null,
  duration_seconds: 600,
  session_type: 'yoga',
  provider: 'manual',
  external_id: null,
  heart_rate_avg: 62,
  heart_rate_start: null,
  heart_rate_end: null,
  hrv_rmssd: null,
  stress_level_start: null,
  stress_level_end: null,
  mood_entry_id: null,
  notes: 'calm',
  created_at: '2026-10-14T08:00:00.000Z',
  updated_at: '2026-10-14T08:00:00.000Z',
};

describe('MindfulnessLogScreen', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockSaveSession.mockResolvedValue(undefined);
    mockUpdateSession.mockResolvedValue(undefined);
    mockIsFocused.mockReturnValue(true);
  });

  it('logs a new session on the date it was opened for, then closes', async () => {
    renderScreen({ date: DATE });

    expect(screen.getByText('Log Mindful Session')).toBeTruthy();
    fireEvent.press(screen.getByText('Save'));

    await screen.findByText('Save');
    expect(mockSaveSession).toHaveBeenCalledWith({
      entry_date: DATE,
      duration_seconds: 15 * 60,
      session_type: 'meditation',
      provider: 'manual',
      notes: null,
      heart_rate_avg: null,
      heart_rate_start: null,
      heart_rate_end: null,
      hrv_rmssd: null,
    });
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('edits the session it was opened with', async () => {
    renderScreen({ date: DATE, session });

    expect(screen.getByText('Edit Mindful Session')).toBeTruthy();
    fireEvent.changeText(screen.getByLabelText('Duration in minutes'), '20');
    fireEvent.press(screen.getByText('Save'));

    await screen.findByText('Save');
    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockUpdateSession).toHaveBeenCalledWith('session-1', {
      duration_seconds: 20 * 60,
      session_type: 'yoga',
      notes: 'calm',
      heart_rate_avg: 62,
      heart_rate_start: null,
      heart_rate_end: null,
      hrv_rmssd: null,
    });
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('closes from the header without saving', () => {
    renderScreen({ date: DATE });

    fireEvent.press(screen.getByLabelText('Cancel'));

    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
    expect(mockSaveSession).not.toHaveBeenCalled();
  });

  it('does not save a session with no duration', () => {
    renderScreen({ date: DATE });

    fireEvent.changeText(screen.getByLabelText('Duration in minutes'), '0');
    fireEvent.press(screen.getByText('Save'));

    expect(mockSaveSession).not.toHaveBeenCalled();
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it('does not close the screen it was opened from when the save lands after leaving', async () => {
    // Cancel, Back or a swipe while the save was pending already closed this
    // screen; going back again would close MindfulnessDetail under it.
    mockIsFocused.mockReturnValue(false);
    renderScreen({ date: DATE, session });

    fireEvent.press(screen.getByText('Save'));

    await screen.findByText('Save');
    expect(mockUpdateSession).toHaveBeenCalledTimes(1);
    expect(mockNavigation.goBack).not.toHaveBeenCalled();
  });

  it('keeps the header below the status bar and Save above the navigation bar on Android', () => {
    const osSpy = jest.replaceProperty(Platform, 'OS', 'android');
    renderScreen({ date: DATE });

    expect(paddingAbove('Log Mindful Session', 'paddingTop')).toBe(
      ANDROID_INSETS.top
    );
    expect(paddingAbove('Save', 'paddingBottom')).toBe(ANDROID_INSETS.bottom);
    osSpy.restore();
  });

  it('adds no top inset on iOS, where the sheet already starts below the status bar', () => {
    const osSpy = jest.replaceProperty(Platform, 'OS', 'ios');
    renderScreen({ date: DATE });

    expect(paddingAbove('Log Mindful Session', 'paddingTop')).toBeUndefined();
    osSpy.restore();
  });
});
