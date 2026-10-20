import React from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import Toast from 'react-native-toast-message';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MoodLogScreen from '../../src/screens/MoodLogScreen';
import { initializeI18n } from '../../src/localization/i18n';
import type { RootStackScreenProps } from '../../src/types/navigation';
import type { MoodEntry } from '../../src/services/api/moodApi';

type ScreenProps = RootStackScreenProps<'MoodLog'>;

const mockMutateAsync = jest.fn();
let mockEntry: MoodEntry | null = null;
jest.mock('../../src/hooks/useMood', () => ({
  useMoodEntryForDate: () => ({
    entry: mockEntry,
    isLoading: false,
    isError: false,
  }),
  useSaveMood: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  useCustomMoods: () => [],
  useMoodEntries: () => ({
    entries: [],
    points: [],
    isLoading: false,
    isError: false,
  }),
}));

let mockSupported: boolean | null = true;
jest.mock('../../src/hooks/useMoodRatingsSupport', () => ({
  useMoodRatingsSupport: () => ({
    supported: mockSupported,
    isLoading: false,
  }),
}));

jest.mock('../../src/components/mood/MoodLineChart', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('react-native-toast-message', () => ({
  __esModule: true,
  default: { show: jest.fn() },
}));

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

const mockNavigation = {
  setOptions: jest.fn(),
  goBack: jest.fn(),
  isFocused: jest.fn(() => true),
  navigate: jest.fn(),
  dispatch: jest.fn(),
} as unknown as ScreenProps['navigation'];
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => mockNavigation,
}));

const DATE = '2026-10-14';
const frame = { x: 0, y: 0, width: 390, height: 844 };

const renderScreen = () =>
  render(
    <SafeAreaProvider
      initialMetrics={{
        insets: { top: 24, bottom: 48, left: 0, right: 0 },
        frame,
      }}
    >
      <MoodLogScreen
        navigation={mockNavigation}
        route={{ key: 'MoodLog-key', name: 'MoodLog', params: { date: DATE } }}
      />
    </SafeAreaProvider>
  );

const savedEntry = (overrides: Partial<MoodEntry> = {}): MoodEntry =>
  ({
    id: 'mood-1',
    mood_value: 70,
    mood_tags: [],
    notes: null,
    entry_date: DATE,
    energy_value: 3,
    ...overrides,
  }) as MoodEntry;

const pressSave = async () => {
  fireEvent.press(screen.getByText('Save'));
  await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
};

describe('MoodLogScreen energy, focus and journal', () => {
  beforeAll(async () => {
    await initializeI18n('en');
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockEntry = null;
    mockSupported = true;
    mockMutateAsync.mockResolvedValue({ energy_value: null });
  });

  it('shows Energy, Focus and the Journal box when the server supports them', () => {
    renderScreen();
    expect(screen.getByText('Energy')).toBeTruthy();
    expect(screen.getByText('Focus')).toBeTruthy();
    expect(screen.getByText('Journal (optional)')).toBeTruthy();
  });

  it('hides Energy and Focus when the server does not support them', () => {
    mockSupported = false;
    renderScreen();
    expect(screen.queryByText('Energy')).toBeNull();
    expect(screen.queryByText('Focus')).toBeNull();
    expect(screen.getByText('Journal (optional)')).toBeTruthy();
  });

  it('shows Energy and Focus while support is unknown', () => {
    mockSupported = null;
    renderScreen();
    expect(screen.getByText('Energy')).toBeTruthy();
    expect(screen.getByText('Focus')).toBeTruthy();
  });

  it('leaves untouched ratings out of the saved body', async () => {
    mockEntry = savedEntry();
    renderScreen();
    await pressSave();
    const body = mockMutateAsync.mock.calls[0][0];
    expect(body).not.toHaveProperty('energy_value');
    expect(body).not.toHaveProperty('focus_value');
    expect(body.mood_value).toBe(70);
  });

  it('sends a changed rating', async () => {
    mockEntry = savedEntry();
    renderScreen();
    fireEvent.press(screen.getByLabelText('Energy 4'));
    await pressSave();
    const body = mockMutateAsync.mock.calls[0][0];
    expect(body.energy_value).toBe(4);
    expect(body).not.toHaveProperty('focus_value');
  });

  it('sends null when the selected rating is tapped again', async () => {
    mockEntry = savedEntry();
    renderScreen();
    fireEvent.press(screen.getByLabelText('Energy 3'));
    await pressSave();
    expect(mockMutateAsync.mock.calls[0][0].energy_value).toBeNull();
  });

  it('never sends ratings to a server that does not support them', async () => {
    mockSupported = false;
    renderScreen();
    await pressSave();
    const body = mockMutateAsync.mock.calls[0][0];
    expect(body).not.toHaveProperty('energy_value');
    expect(body).not.toHaveProperty('focus_value');
  });

  it('tells the user when the server dropped a rating that was sent', async () => {
    mockSupported = null;
    mockMutateAsync.mockResolvedValue({ id: 'mood-1', mood_value: 50 });
    renderScreen();
    fireEvent.press(screen.getByLabelText('Focus 2'));
    await pressSave();
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
    expect(Toast.show).toHaveBeenCalledWith(
      expect.objectContaining({
        text1:
          "Your server doesn't save energy and focus yet. Update SparkyFitness to keep them.",
      })
    );
  });

  it('does not show the notice when the server echoes the ratings', async () => {
    renderScreen();
    fireEvent.press(screen.getByLabelText('Focus 2'));
    await pressSave();
    await waitFor(() => expect(mockNavigation.goBack).toHaveBeenCalled());
    expect(Toast.show).not.toHaveBeenCalled();
  });

  it('saves what is typed in the Journal box as notes', async () => {
    renderScreen();
    fireEvent.changeText(
      screen.getByLabelText('Journal (optional)'),
      'Slept well'
    );
    await pressSave();
    expect(mockMutateAsync.mock.calls[0][0].notes).toBe('Slept well');
  });
});
