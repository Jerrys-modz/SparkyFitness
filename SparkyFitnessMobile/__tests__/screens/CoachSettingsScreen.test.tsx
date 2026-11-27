import React from 'react';
import { render, screen } from '@testing-library/react-native';
import CoachSettingsScreen from '../../src/screens/CoachSettingsScreen';
import { initializeI18n } from '../../src/localization/i18n';

jest.mock('../../src/hooks/useScreenHeader', () => ({
  useScreenHeader: () => null,
}));
jest.mock('../../src/services/nativeTabBarPreference', () => ({
  useNativeIOSHeadersActive: () => false,
}));
jest.mock('../../src/components/ActiveWorkoutBar', () => ({
  useActiveWorkoutBarPadding: () => 0,
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../src/components/Icon', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="icon" /> };
});
jest.mock('../../src/components/ServerGate', () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../../src/components/ReminderTimeRows', () => ({
  useReminderTimeRows: () => ({ rows: null, sheet: null }),
}));
jest.mock('../../src/components/BottomSheetPicker', () => {
  const React = require('react');
  const { View } = require('react-native');
  const MockPicker = (props: {
    title?: string;
    value?: string;
    options?: { label: string; value: string }[];
    onSelect?: (value: string) => void;
  }) =>
    React.createElement(View, {
      testID: `picker-${props.title}`,
      accessibilityValue: { text: String(props.value) },
      ...props,
    });
  return { __esModule: true, default: MockPicker };
});
jest.mock('../../src/hooks/usePreferences', () => ({
  usePreferences: () => ({ preferences: null }),
}));
jest.mock('../../src/hooks/useProfile', () => ({
  useProfile: () => ({ profile: { id: 'u1' } }),
}));
jest.mock('../../src/hooks/useCustomMeasurements', () => ({
  useCustomCategories: () => ({
    data: [
      {
        id: 'h1',
        name: 'stretch',
        display_name: 'Stretch',
        data_type: 'boolean',
      },
      { id: 'n1', name: 'steps', display_name: 'Steps', data_type: 'numeric' },
    ],
  }),
}));

const mockUpdateBuiltin = jest.fn();
let mockCoaches: unknown[] = [];
jest.mock('../../src/hooks/useCoaches', () => {
  const idle = { mutate: jest.fn(), isPending: false, data: undefined };
  return {
    useCoachesAvailable: () => true,
    useCoachSettings: () => ({
      data: {
        profile: {
          diet_type: null,
          tone: null,
          paused_until: null,
          checkin_times: ['08:00'],
          max_messages_per_day: 3,
          foods_avoid: '',
          foods_prefer: '',
          notes: '',
        },
        allergens: [],
        coaches: mockCoaches,
        last_checkin_at: null,
      },
      isLoading: false,
      refetch: jest.fn(),
    }),
    useUpdateCoachProfile: () => idle,
    useUpdateBuiltinCoach: () => ({
      mutate: mockUpdateBuiltin,
      isPending: false,
    }),
    useUpdateCustomCoach: () => idle,
    useCheckInNow: () => idle,
  };
});

const builtin = (key: string, enabled: boolean, settings = {}) => ({
  id: `c-${key}`,
  builtin_key: key,
  name: null,
  enabled,
  settings,
  rules: { version: 1, rules: [] },
});

const renderScreen = () =>
  render(<CoachSettingsScreen {...({ navigation: {} } as never)} />);

beforeAll(async () => {
  await initializeI18n();
});

beforeEach(() => {
  mockUpdateBuiltin.mockClear();
});

describe('CoachSettingsScreen coach settings', () => {
  it('lets the habits coach pick one of the yes/no measurements', () => {
    mockCoaches = [builtin('habits', true)];
    renderScreen();
    const picker = screen.getByTestId('picker-Habit to focus on');
    expect(picker.props.options.map((o: { value: string }) => o.value)).toEqual(
      ['none', 'h1']
    );
    // No habit yet: the row says the coach stays quiet.
    expect(screen.getByText(/this coach stays quiet/)).toBeTruthy();

    picker.props.onSelect('h1');
    expect(mockUpdateBuiltin).toHaveBeenCalledWith({
      key: 'habits',
      body: { settings: { focus_habit_id: 'h1' } },
    });
    picker.props.onSelect('none');
    expect(mockUpdateBuiltin).toHaveBeenLastCalledWith({
      key: 'habits',
      body: { settings: { focus_habit_id: null } },
    });
  });

  it('lets the weekly review pick its weekday', () => {
    mockCoaches = [builtin('weekly_review', true, { weekday: 3 })];
    renderScreen();
    const picker = screen.getByTestId('picker-Runs on');
    expect(picker.props.value).toBe('3');
    picker.props.onSelect('1');
    expect(mockUpdateBuiltin).toHaveBeenCalledWith({
      key: 'weekly_review',
      body: { settings: { weekday: 1 } },
    });
  });

  it('shows no settings for a coach that is off or takes none', () => {
    mockCoaches = [builtin('weekly_review', false), builtin('recovery', true)];
    renderScreen();
    expect(screen.queryByTestId('picker-Runs on')).toBeNull();
    expect(screen.queryByTestId('picker-Habit to focus on')).toBeNull();
  });
});
